import type { RuntimeMessage, TrackedItem } from "./types";

chrome.runtime.onInstalled.addListener(async () => {
  const { trackedItems } = await chrome.storage.local.get(["trackedItems"]);
  if (!Array.isArray(trackedItems)) {
    await chrome.storage.local.set({ trackedItems: [] });
  }
});

function generateId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, _sendResponse) => {
  if (message.type === "PRICE_PICKED") {
    (async () => {
      try {
        const { trackedItems, pendingUserNotes } = (await chrome.storage.local.get([
          "trackedItems",
          "pendingUserNotes"
        ])) as { trackedItems?: unknown; pendingUserNotes?: unknown };

        const list = Array.isArray(trackedItems) ? trackedItems : [];
        const item: TrackedItem = {
          ...message.payload,
          userNotes: typeof pendingUserNotes === "string" ? pendingUserNotes : "",
          savedAtIso: new Date().toISOString(),
          id: generateId()
        };

        await chrome.storage.local.set({ trackedItems: [...list, item], pendingUserNotes: "" });
        try {
          await chrome.runtime.sendMessage({ type: "TRACKED_ITEM_SAVED", item });
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
});
