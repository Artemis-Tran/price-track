import type { RuntimeMessage, TrackedItem, Notification } from "./types";
import { getToken } from "./auth";
import { fetchNotifications } from "./notifications";

/**
 * Generates a unique ID for a tracked item.
 * Uses `crypto.randomUUID` if available, otherwise falls back to a timestamp-based ID.
 * @returns A unique string identifier.
 */
function generateId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Alarm name for polling notifications
const ALARM_NAME = "poll_notifications";

/**
 * Initializes the alarm for polling notifications.
 */
function initAlarm() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    }
  });
}

/**
 * Polls for new notifications and displays them.
 */
async function pollNotifications() {
  try {
    const token = await getToken();
    if (!token) {
      // User might not be logged in or session expired
      return;
    }

    const notifications = await fetchNotifications(token);
    const unread = notifications.filter((n) => !n.isRead);

    if (unread.length === 0) return;

    // Get the last seen notification timestamp
    const storage = await chrome.storage.local.get("lastSeenNotificationTime");
    const lastSeenTime = storage.lastSeenNotificationTime
      ? new Date(storage.lastSeenNotificationTime).getTime()
      : Date.now(); // Default to now on first run to avoid spam

    // Filter for new notifications only
    const newNotifications = unread.filter((n) => {
      const createdAt = new Date(n.createdAt).getTime();
      return createdAt > lastSeenTime;
    });

    if (newNotifications.length > 0) {
      // Update last seen time to the most recent notification
      const mostRecent = newNotifications.reduce((prev, current) => {
        return new Date(prev.createdAt).getTime() >
          new Date(current.createdAt).getTime()
          ? prev
          : current;
      });
      await chrome.storage.local.set({
        lastSeenNotificationTime: mostRecent.createdAt,
      });

      // Display notifications
      for (const notification of newNotifications) {
        let message = notification.message;
        if (
          notification.type === "price_drop" &&
          notification.oldPrice &&
          notification.newPrice
        ) {
          message = `Price dropped from ${notification.oldPrice} to ${notification.newPrice}!`;
        }

        chrome.notifications.create(notification.id, {
          type: "basic",
          iconUrl: "assets/icons/icon128.png",
          title: notification.title,
          message: message,
          priority: 2,
        });
      }
    }
  } catch (err) {
    console.error("Failed to poll notifications:", err);
  }
}

// Initialize alarm on install/startup
chrome.runtime.onInstalled.addListener(() => {
  initAlarm();
  // Set initial lastSeenNotificationTime to now so we don't show old notifications
  chrome.storage.local.set({
    lastSeenNotificationTime: new Date().toISOString(),
  });
});
chrome.runtime.onStartup.addListener(initAlarm);

// Listen for the alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollNotifications();
  }
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, _sendResponse) => {
    if (message.type === "PRICE_PICKED") {
      (async () => {
        try {
          const item: TrackedItem = {
            ...message.payload,
            savedAtIso: new Date().toISOString(),
            id: generateId(),
          };

          try {
            const token = await getToken();
            const headers: HeadersInit = {
              "Content-Type": "application/json",
            };
            if (token) {
              headers["Authorization"] = `Bearer ${token}`;
            } else {
              console.warn("No auth token found, request might fail");
            }

            const res = await fetch("http://localhost:8080/items", {
              method: "POST",
              headers,
              body: JSON.stringify(item),
            });

            if (!res.ok) {
              console.error("Backend error:", res.status, res.statusText);
            }
          } catch (err) {
            console.error("Failed to send item to backend:", err);
          }

          try {
            await chrome.runtime.sendMessage({
              type: "TRACKED_ITEM_SAVED",
              item,
            });
          } catch {
            // No active listeners (e.g., popup closed) is fine.
          }
        } catch (error) {
          console.error("Failed to save tracked price pick", error);
        }
      })();
      // async handler
      return true;
    }

    if (message.type === "PRICE_PICK_CANCELLED") {
      chrome.storage.local.set({ pendingUserNotes: "" });
    }

    return false;
  }
);
