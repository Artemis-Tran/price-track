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
  
  // Show loading spinner
  trackedItemsList.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 20px;">
      <div class="loader"></div>
    </div>
  `;

  let trackedItems: TrackedItem[] = [];
  try {
    const res = await fetch("http://localhost:8080/items");
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    trackedItems = await res.json();
  } catch (err) {
    console.error("Failed to fetch from backend:", err);
    if (statusText) statusText.textContent = "Error: Could not connect to backend.";
    trackedItems = []; // Ensure it's empty on error
  }
  
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
            <div class="item-price">${item.priceText}</div>
          </div>
        </div>
      </div>
      <button class="delete-btn" data-id="${item.id}">
        <svg viewBox="0 0 24 24">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
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
    if (userNotesInput) userNotesInput.value = ""; // Clear notes after saving
    if (statusText) statusText.textContent = "Saved to tracked items.";

    renderTrackedItems();
  }
  if (message.type === "PRICE_PICK_CANCELLED") {
    if (statusText) statusText.textContent = "Cancelled.";
  }
});

clearAllButton?.addEventListener("click", async () => {
    try {
        await fetch("http://localhost:8080/items", { method: "DELETE" });
        await renderTrackedItems();
    } catch (err) {
        console.error("Failed to clear all items in backend", err);
        if (statusText) statusText.textContent = "Error: Could not clear items from backend.";
    }
});

trackedItemsList?.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const deleteButton = target.closest(".delete-btn");

  if (deleteButton) {
    const id = deleteButton.getAttribute("data-id");
    if (!id) return;
    
    try {
        await fetch(`http://localhost:8080/items/${id}`, {
            method: "DELETE"
        });
        await renderTrackedItems();
    } catch (err) {
        console.error("Failed to delete item from backend", err);
        if (statusText) statusText.textContent = "Error: Could not delete item from backend.";
    }
  }
});

document.addEventListener("DOMContentLoaded", renderTrackedItems);
