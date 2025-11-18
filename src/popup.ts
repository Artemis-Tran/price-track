import type { PricePickPayload, RuntimeMessage, TrackedItem } from "./types";

const startPickerButton = document.getElementById("startPickerButton") as HTMLButtonElement;
const saveTargetButton = document.getElementById("saveTargetButton") as HTMLButtonElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const saveStatusText = document.getElementById("saveStatusText") as HTMLSpanElement;
const capturedTextElement = document.getElementById("capturedText") as HTMLDivElement;
const capturedCssElement = document.getElementById("capturedCss") as HTMLDivElement;
const capturedXpathElement = document.getElementById("capturedXpath") as HTMLDivElement;
const userNotesInput = document.getElementById("userNotesInput") as HTMLInputElement;
const trackedItemsList = document.getElementById("trackedItemsList") as HTMLDivElement;
const clearAllButton = document.getElementById("clearAllButton") as HTMLButtonElement;

let lastCapture: PricePickPayload | null = null;

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING_PRICE_PICKER" } as RuntimeMessage);
  } catch {
    // If you removed content_scripts from manifest, uncomment to inject on demand:
    // await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

async function renderTrackedItems() {
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
        <a href="${item.pageUrl}" target="_blank">${item.userNotes || "Untitled"}</a>
        <div>${item.priceText}</div>
      </div>
      <button class="delete-btn" data-id="${item.id}">Delete</button>
    `;
    trackedItemsList.appendChild(itemElement);
  }
}

startPickerButton.addEventListener("click", async () => {
  statusText.textContent = "Activating picker… Press Esc to cancel.";
  saveStatusText.textContent = "";
  const tabId = await getActiveTabId();
  if (!tabId) {
    statusText.textContent = "No active tab.";
    return;
  }
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, { type: "START_PRICE_PICK" } as RuntimeMessage);
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
  if (message.type === "PRICE_PICKED") {
    statusText.textContent = "Captured.";
    const { priceText, cssSelector, xPath } = message.payload;
    lastCapture = message.payload;

    capturedTextElement.textContent = priceText || "(empty)";
    capturedTextElement.classList.toggle("muted", !priceText);
    capturedCssElement.textContent = cssSelector || "(none)";
    capturedCssElement.classList.toggle("muted", !cssSelector);
    capturedXpathElement.textContent = xPath || "(none)";
    capturedXpathElement.classList.toggle("muted", !xPath);

    saveTargetButton.disabled = false;
  }
  if (message.type === "PRICE_PICK_CANCELLED") {
    statusText.textContent = "Cancelled.";
  }
});

saveTargetButton.addEventListener("click", async () => {
  if (!lastCapture) return;

  const annotatedRecord: TrackedItem = {
    ...lastCapture,
    userNotes: userNotesInput.value?.trim() ?? "",
    savedAtIso: new Date().toISOString(),
    id:
      crypto.getRandomValues(new Uint32Array(1))[0]!.toString(16) + // fix later undefined
      "-" +
      Date.now().toString(),
  };

  try {
    const { trackedItems } = (await chrome.storage.local.get(["trackedItems"])) as {
      trackedItems?: TrackedItem[];
    };
    const list = Array.isArray(trackedItems) ? trackedItems : [];
    list.push(annotatedRecord);
    await chrome.storage.local.set({ trackedItems: list });
    saveStatusText.textContent = "Saved.";
    saveStatusText.className = "ok";
    saveTargetButton.disabled = true;
    await renderTrackedItems();
  } catch {
    saveStatusText.textContent = "Save failed.";
    saveStatusText.className = "error";
  }
});

clearAllButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ trackedItems: [] });
  await renderTrackedItems();
});

trackedItemsList.addEventListener("click", async (event) => {
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
