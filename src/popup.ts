import type { PricePickPayload, RuntimeMessage, TrackedItem } from "./types";

const startPickerButton = document.getElementById("startPickerButton") as HTMLButtonElement;
const saveTargetButton = document.getElementById("saveTargetButton") as HTMLButtonElement;
const statusText = document.getElementById("statusText") as HTMLSpanElement;
const saveStatusText = document.getElementById("saveStatusText") as HTMLSpanElement;
const capturedTextElement = document.getElementById("capturedText") as HTMLDivElement;
const capturedCssElement = document.getElementById("capturedCss") as HTMLDivElement;
const capturedXpathElement = document.getElementById("capturedXpath") as HTMLDivElement;
const userNotesInput = document.getElementById("userNotesInput") as HTMLInputElement;

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
      crypto.getRandomValues(new Uint32Array(1))[0].toString(16) +
      "-" +
      Date.now().toString()
  };

  try {
    const existing = (await chrome.storage.local.get(["trackedItems"])).trackedItems as TrackedItem[] | undefined;
    const list = Array.isArray(existing) ? existing : [];
    list.push(annotatedRecord);
    await chrome.storage.local.set({ trackedItems: list });
    saveStatusText.textContent = "Saved.";
    saveStatusText.className = "ok";
    saveTargetButton.disabled = true;
  } catch {
    saveStatusText.textContent = "Save failed.";
    saveStatusText.className = "error";
  }
});
