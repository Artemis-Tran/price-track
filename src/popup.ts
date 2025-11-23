import type { RuntimeMessage, TrackedItem } from "./types";

const startPickerButton = document.getElementById("startPickerButton") as HTMLButtonElement | null;
const statusText = document.getElementById("statusText") as HTMLSpanElement | null;
const userNotesInput = document.getElementById("userNotesInput") as HTMLInputElement | null;
const trackedItemsList = document.getElementById("trackedItemsList") as HTMLDivElement | null;
const clearAllButton = document.getElementById("clearAllButton") as HTMLButtonElement | null;


async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING_PRICE_PICKER" } as RuntimeMessage);
    return;
  } catch {
    // Try to inject on demand if the content script is not present yet.
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    // Verify the injection succeeded; this will throw if it still fails.
    await chrome.tabs.sendMessage(tabId, { type: "PING_PRICE_PICKER" } as RuntimeMessage);
  }
}

async function renderTrackedItems() {
  if (!trackedItemsList) return;
  const { trackedItems } = (await chrome.storage.local.get(["trackedItems"])) as {
    trackedItems?: TrackedItem[];
  };
  trackedItemsList.innerHTML = "";

  if (!trackedItems || trackedItems.length === 0) {
    trackedItemsList.innerHTML = '<div class="muted" style="padding: 8px;">No items tracked yet.</div>';
    return;
  }

  for (const item of trackedItems) {
    const itemElement = document.createElement("div");
    itemElement.className = "tracked-item";
    itemElement.innerHTML = `
      <div class="item-info">
        <div class="item-main">
          ${item.imageUrl ? `<img class="thumb" src="${item.imageUrl}" alt="" />` : ""}
          <div class="meta">
            <a href="${item.pageUrl}" target="_blank">${item.productName || "Untitled"}</a>
            <div>${item.priceText}</div>
          </div>
        </div>
      </div>
      <button class="delete-btn" data-id="${item.id}">Delete</button>
    `;
    trackedItemsList.appendChild(itemElement);
  }
}

startPickerButton?.addEventListener("click", async () => {
  if (statusText) statusText.textContent = "Activating picker… Press Esc to cancel.";
  const tabId = await getActiveTabId();
  if (!tabId) {
    if (statusText) statusText.textContent = "No active tab.";
    return;
  }
  try {
    await chrome.storage.local.set({ pendingUserNotes: userNotesInput?.value?.trim() ?? "" });
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "START_PRICE_PICK" } as RuntimeMessage);
  } catch {
    if (statusText) {
      statusText.textContent = "Failed to start picker. Make sure the extension is allowed on this site.";
    }
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "PRICE_PICKED") {
    if (statusText) statusText.textContent = "Captured. Saving…";
  }

  if (message.type === "TRACKED_ITEM_SAVED") {
    const { item } = message;
    if (userNotesInput) userNotesInput.value = item.userNotes;
    if (statusText) statusText.textContent = "Saved to tracked items.";

    renderTrackedItems();
  }
  if (message.type === "PRICE_PICK_CANCELLED") {
    if (statusText) statusText.textContent = "Cancelled.";
  }
});

clearAllButton?.addEventListener("click", async () => {
  await chrome.storage.local.set({ trackedItems: [] });
  await renderTrackedItems();
});

trackedItemsList?.addEventListener("click", async (event) => {
  const target = event.target as HTMLButtonElement;
  if (target.classList.contains("delete-btn")) {
    const id = target.dataset.id;
    if (!id) return;
    const { trackedItems } = (await chrome.storage.local.get(["trackedItems"])) as {
      trackedItems?: TrackedItem[];
    };
    if (!trackedItems) return;
    const newList = trackedItems.filter((item) => item.id !== id);
    await chrome.storage.local.set({ trackedItems: newList });
    await renderTrackedItems();
  }
});

document.addEventListener("DOMContentLoaded", renderTrackedItems);
