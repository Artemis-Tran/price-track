import type { RuntimeMessage, TrackedItem, Notification } from "./types";
import { signIn, signUp, signOut, getSession } from "./auth";
import {
  fetchNotifications,
  markNotificationRead,
  getUnreadNotifications,
  getUnreadPriceDropByProduct,
  formatNotificationTime,
} from "./notifications";

// UI References
const authContainer = document.getElementById(
  "authContainer"
) as HTMLDivElement;
const mainContainer = document.getElementById(
  "mainContainer"
) as HTMLDivElement;

const authForm = document.getElementById("authForm") as HTMLFormElement | null;
const authButton = document.getElementById(
  "authButton"
) as HTMLButtonElement | null;
const logoutButton = document.getElementById(
  "logoutButton"
) as HTMLButtonElement | null;
const emailInput = document.getElementById(
  "emailInput"
) as HTMLInputElement | null;
const passwordInput = document.getElementById(
  "passwordInput"
) as HTMLInputElement | null;
const authMessage = document.getElementById(
  "authMessage"
) as HTMLParagraphElement | null;
const toggleAuthModeLink = document.getElementById(
  "toggleAuthMode"
) as HTMLAnchorElement | null;

// Auth Mode Enum
enum AuthMode {
  SIGN_IN = "SIGN_IN",
  SIGN_UP = "SIGN_UP",
}
let currentAuthMode = AuthMode.SIGN_IN;

const startPickerButton = document.getElementById(
  "startPickerButton"
) as HTMLButtonElement | null;
const statusText = document.getElementById(
  "statusText"
) as HTMLDivElement | null;
const userNotesInput = document.getElementById(
  "userNotesInput"
) as HTMLInputElement | null;
const trackedItemsList = document.getElementById(
  "trackedItemsList"
) as HTMLDivElement | null;
const clearAllButton = document.getElementById(
  "clearAllButton"
) as HTMLButtonElement | null;

// Notification UI References
const notificationBell = document.getElementById(
  "notificationBell"
) as HTMLButtonElement | null;
const notificationDropdown = document.getElementById(
  "notificationDropdown"
) as HTMLDivElement | null;
const notificationList = document.getElementById(
  "notificationList"
) as HTMLDivElement | null;
const notificationBadge = document.getElementById(
  "notificationBadge"
) as HTMLSpanElement | null;

// State
let authToken: string | undefined;
let notifications: Notification[] = [];
let unreadPriceDropByProduct: Map<string, Notification> = new Map();

async function updateUIState() {
  const { session } = await getSession();
  if (session) {
    authToken = session.access_token;
    authContainer.classList.add("hidden");
    mainContainer.classList.remove("hidden");
    await loadNotifications();
    renderTrackedItems();
  } else {
    authToken = undefined;
    authContainer.classList.remove("hidden");
    mainContainer.classList.add("hidden");
  }
}

async function loadNotifications() {
  if (!authToken) return;

  try {
    notifications = await fetchNotifications(authToken);
    unreadPriceDropByProduct = getUnreadPriceDropByProduct(notifications);
    renderNotifications();
  } catch (err) {
    console.error("Failed to load notifications:", err);
    notifications = [];
    unreadPriceDropByProduct = new Map();
  }
}

function renderNotifications() {
  if (!notificationList || !notificationBadge) return;

  const unreadCount = getUnreadNotifications(notifications).length;

  // Update badge
  if (unreadCount > 0) {
    notificationBadge.textContent =
      unreadCount > 9 ? "9+" : String(unreadCount);
    notificationBadge.style.display = "flex";
  } else {
    notificationBadge.style.display = "none";
  }

  // Render notification list
  if (notifications.length === 0) {
    notificationList.innerHTML =
      '<div class="notification-empty">No notifications yet</div>';
    return;
  }

  notificationList.innerHTML = notifications
    .map(
      (n) => `
    <div class="notification-item ${n.isRead ? "" : "unread"}" data-id="${n.id}">
      <div class="notification-title">${escapeHtml(n.title)}</div>
      <div class="notification-message">${escapeHtml(n.message)}</div>
      <div class="notification-time">${formatNotificationTime(n.createdAt)}</div>
    </div>
  `
    )
    .join("");
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Auth Handlers
toggleAuthModeLink?.addEventListener("click", (e) => {
  e.preventDefault();
  if (currentAuthMode === AuthMode.SIGN_IN) {
    currentAuthMode = AuthMode.SIGN_UP;
    if (authButton) authButton.textContent = "Sign Up";
    if (toggleAuthModeLink)
      toggleAuthModeLink.textContent = "Already have an account? Sign In";
  } else {
    currentAuthMode = AuthMode.SIGN_IN;
    if (authButton) authButton.textContent = "Sign In";
    if (toggleAuthModeLink)
      toggleAuthModeLink.textContent = "Need an account? Sign Up";
  }
  if (authMessage) authMessage.textContent = "";
});

authForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (
    !emailInput ||
    !emailInput.value ||
    !passwordInput ||
    !passwordInput.value
  ) {
    if (authMessage)
      authMessage.textContent = "Please enter both email and password.";
    return;
  }

  const email = emailInput.value;
  const password = passwordInput.value;

  if (authMessage) {
    authMessage.textContent =
      currentAuthMode === AuthMode.SIGN_IN ? "Signing in..." : "Signing up...";
    authMessage.style.color = "var(--text-muted)";
  }

  try {
    let error = null;
    if (currentAuthMode === AuthMode.SIGN_IN) {
      const res = await signIn(email, password);
      error = res.error;
    } else {
      const res = await signUp(email, password);
      error = res.error;
    }

    if (error) {
      if (authMessage) {
        authMessage.textContent = `Error: ${error.message}`;
        authMessage.style.color = "var(--danger)";
      }
    } else {
      if (authMessage) authMessage.textContent = "";
      // If sign up requires email confirmation, this might be a point to show a message.
      // However, usually Supabase session is established immediately if confirm is disabled, or we need to tell user to check email.
      // For now assuming immediate session or "Check email for confirmation".
      if (currentAuthMode === AuthMode.SIGN_UP) {
        // Check if session exists. If not, they probably need to verify email.
        const { session } = await getSession();
        if (!session) {
          if (authMessage) {
            authMessage.textContent =
              "Account created! Please check your email to confirm.";
            authMessage.style.color = "var(--primary)";
          }
          return;
        }
      }
      updateUIState();
    }
  } catch (err: any) {
    // Capture unexpected errors (e.g. network issues)
    console.error("Auth error:", err);
    if (authMessage) {
      authMessage.textContent = `Unexpected error: ${err.message || err}`;
      authMessage.style.color = "var(--danger)";
    }
  }
});

logoutButton?.addEventListener("click", async () => {
  await signOut();
  await updateUIState();
});

// App Logic
async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "PING_PRICE_PICKER",
    } as RuntimeMessage);
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tabId, {
      type: "PING_PRICE_PICKER",
    } as RuntimeMessage);
  }
}

async function authenticatedFetch(url: string, options: RequestInit = {}) {
  if (!authToken) {
    throw new Error("Not authenticated");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${authToken}`);

  return fetch(url, { ...options, headers });
}

async function renderTrackedItems() {
  if (!trackedItemsList) return;

  // Only show loader if empty, otherwise we're refreshing
  if (trackedItemsList.children.length === 0) {
    trackedItemsList.innerHTML = `
        <div style="display: flex; justify-content: center; padding: 20px;">
          <div class="loader"></div>
        </div>
      `;
  }

  let trackedItems: TrackedItem[] = [];
  const currentScrollTop = trackedItemsList.scrollTop; // Save scroll position

  try {
    const res = await authenticatedFetch(`${process.env.API_BASE_URL}/items`);
    if (!res.ok) {
      if (res.status === 401) {
        await signOut();
        await updateUIState();
        if (authMessage) {
          authMessage.textContent =
            "Session expired or invalid. Please log in again.";
          authMessage.style.color = "var(--danger)";
        }
        return;
      }
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    trackedItems = await res.json();

    if (startPickerButton) {
      if (trackedItems.length >= 5) {
        startPickerButton.disabled = true;
        startPickerButton.textContent = "Limit Reached (5/5)";
        startPickerButton.title = "You can only track up to 5 items.";
        startPickerButton.style.opacity = "0.6";
        startPickerButton.style.cursor = "not-allowed";
      } else {
        startPickerButton.disabled = false;
        startPickerButton.textContent = "Select Price";
        startPickerButton.title = "";
        startPickerButton.style.opacity = "";
        startPickerButton.style.cursor = "";
      }
    }
  } catch (err) {
    console.error("Failed to fetch from backend:", err);
    if (statusText)
      statusText.textContent = "Error: Could not connect to backend.";
    trackedItemsList.innerHTML = `<div class="muted" style="text-align:center; padding: 24px;">Failed to load items.</div>`;
    return;
  }

  trackedItemsList.innerHTML = "";

  if (!trackedItems || trackedItems.length === 0) {
    trackedItemsList.innerHTML =
      '<div class="muted" style="text-align:center; padding: 24px;">No items tracked yet.</div>';
    return;
  }

  for (const item of trackedItems) {
    const itemElement = document.createElement("div");
    itemElement.className = "tracked-item";

    // Check for price drop notification
    const priceDropNotification = unreadPriceDropByProduct.get(item.id);
    const hasPriceDrop = !!priceDropNotification;

    // Safety check for image URL
    // Use loading="lazy" for performance
    const imgHtml = item.imageUrl
      ? `<img class="thumb" src="${item.imageUrl}" alt="Product Image" loading="lazy" />`
      : `<div class="thumb" style="display: flex; align-items: center; justify-content: center; color: #cbd5e1;">📷</div>`;

    // Price drop indicator HTML
    const priceDropIndicator = hasPriceDrop
      ? '<div class="price-drop-indicator" title="Price dropped!">!</div>'
      : "";

    // Use oldPrice and newPrice from notification if available
    let priceHtml = `<span class="item-price">${escapeHtml(item.priceText)}</span>`;
    if (hasPriceDrop && priceDropNotification) {
      if (priceDropNotification.oldPrice && priceDropNotification.newPrice) {
        priceHtml = `<span class="old-price">${escapeHtml(priceDropNotification.oldPrice)}</span><span class="new-price">${escapeHtml(priceDropNotification.newPrice)}</span>`;
      }
    }

    itemElement.innerHTML = `
      ${priceDropIndicator}
      <div class="item-info">
        ${imgHtml}
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <a href="${item.pageUrl}" target="_blank" title="${item.productName || "Untitled"}">${item.productName || "Untitled"}</a>
          ${priceHtml}
        </div>
      </div>
      <button class="delete-btn" data-id="${item.id}" title="Stop tracking">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    `;
    trackedItemsList.appendChild(itemElement);
  }

  // Restore scroll position
  if (currentScrollTop > 0) {
    trackedItemsList.scrollTop = currentScrollTop;
  }
}

startPickerButton?.addEventListener("click", async () => {
  if (statusText) statusText.textContent = "Activating picker...";
  const tabId = await getActiveTabId();
  if (!tabId) {
    if (statusText) statusText.textContent = "No active tab.";
    return;
  }
  try {
    await chrome.storage.local.set({
      pendingUserNotes: userNotesInput?.value?.trim() ?? "",
    });

    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, {
      type: "START_PRICE_PICK",
    } as RuntimeMessage);
    // Close popup so user can interact with page
    window.close();
  } catch {
    if (statusText) {
      statusText.textContent = "Failed. Refresh the page and try again.";
    }
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "PRICE_PICKED") {
  }

  if (message.type === "TRACKED_ITEM_SAVED") {
    if (userNotesInput) userNotesInput.value = "";
    if (statusText) statusText.textContent = "Saved item!";
    renderTrackedItems();
  }
});

clearAllButton?.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to delete all tracked items?")) return;
  try {
    await authenticatedFetch(`${process.env.API_BASE_URL}/items`, {
      method: "DELETE",
    });
    await renderTrackedItems();
  } catch (err) {
    console.error("Failed to clear items", err);
  }
});

trackedItemsList?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const deleteButton = target.closest(".delete-btn");

  if (deleteButton) {
    const id = deleteButton.getAttribute("data-id");
    if (!id) return;

    // Optimistic Delete: Remove from UI immediately
    const itemElement = deleteButton.closest(".tracked-item");
    itemElement?.remove();

    // If list is now empty, show empty state
    if (trackedItemsList && trackedItemsList.children.length === 0) {
      trackedItemsList.innerHTML =
        '<div class="muted" style="text-align:center; padding: 24px;">No items tracked yet.</div>';
    }

    try {
      await authenticatedFetch(`${process.env.API_BASE_URL}/items/${id}`, {
        method: "DELETE",
      });
      // Do NOT re-render here to avoid flash/jump. The item is already gone.
      // We only re-fetch if we suspect state drift, but for simple delete, it's fine.
    } catch (err) {
      console.error("Failed to delete item", err);
      // Rollback would go here (alert user and maybe re-fetch list)
      alert("Failed to delete item. Please refresh.");
      renderTrackedItems();
    }
  }
});

function setupSmoothScroll(container: HTMLElement) {
  let target = container.scrollTop;
  let pos = container.scrollTop;
  let rafId: number | null = null;

  container.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (rafId === null) {
        target = container.scrollTop;
        pos = container.scrollTop;
      }

      target += e.deltaY;
      target = Math.max(
        0,
        Math.min(container.scrollHeight - container.clientHeight, target)
      );

      if (rafId === null) {
        rafId = requestAnimationFrame(animate);
      }
    },
    { passive: false }
  );

  function animate() {
    const diff = target - pos;
    if (Math.abs(diff) < 1) {
      container.scrollTop = target;
      pos = target;
      rafId = null;
      return;
    }

    pos += diff * 0.075;
    container.scrollTop = pos;
    rafId = requestAnimationFrame(animate);
  }
}

if (trackedItemsList) setupSmoothScroll(trackedItemsList);

// Notification Bell Toggle
notificationBell?.addEventListener("click", (e) => {
  e.stopPropagation();
  notificationDropdown?.classList.toggle("open");
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (
    !notificationDropdown?.contains(target) &&
    !notificationBell?.contains(target)
  ) {
    notificationDropdown?.classList.remove("open");
  }
});

// Mark notification as read on click
notificationList?.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const notificationItem = target.closest(
    ".notification-item"
  ) as HTMLElement | null;

  if (notificationItem && notificationItem.classList.contains("unread")) {
    const notificationId = notificationItem.dataset.id;
    if (notificationId && authToken) {
      try {
        await markNotificationRead(authToken, notificationId);
        notificationItem.classList.remove("unread");

        // Update local state and re-render
        const notification = notifications.find((n) => n.id === notificationId);
        if (notification) {
          notification.isRead = true;
          notification.readAt = new Date().toISOString();
        }
        unreadPriceDropByProduct = getUnreadPriceDropByProduct(notifications);
        renderNotifications();
        renderTrackedItems(); // Refresh items to remove price drop indicator
      } catch (err) {
        console.error("Failed to mark notification as read:", err);
      }
    }
  }
});

document.addEventListener("DOMContentLoaded", updateUIState);
