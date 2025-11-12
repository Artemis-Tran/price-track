chrome.runtime.onInstalled.addListener(async () => {
  const { trackedItems } = await chrome.storage.local.get(["trackedItems"]);
  if (!Array.isArray(trackedItems)) {
    await chrome.storage.local.set({ trackedItems: [] });
  }
});
