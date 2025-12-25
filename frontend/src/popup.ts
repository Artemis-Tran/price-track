
import type { RuntimeMessage, TrackedItem } from "./types";
import { signIn, signUp, signOut, getSession } from "./auth";

// UI References
const authContainer = document.getElementById("authContainer") as HTMLDivElement;
const mainContainer = document.getElementById("mainContainer") as HTMLDivElement;

const authForm = document.getElementById("authForm") as HTMLFormElement | null;
const authButton = document.getElementById("authButton") as HTMLButtonElement | null;
const logoutButton = document.getElementById("logoutButton") as HTMLButtonElement | null;
const emailInput = document.getElementById("emailInput") as HTMLInputElement | null;
const passwordInput = document.getElementById("passwordInput") as HTMLInputElement | null;
const authMessage = document.getElementById("authMessage") as HTMLParagraphElement | null;
const toggleAuthModeLink = document.getElementById("toggleAuthMode") as HTMLAnchorElement | null;

// Auth Mode Enum
enum AuthMode {
  SIGN_IN = "SIGN_IN",
  SIGN_UP = "SIGN_UP"
}
let currentAuthMode = AuthMode.SIGN_IN;

const startPickerButton = document.getElementById("startPickerButton") as HTMLButtonElement | null;
const statusText = document.getElementById("statusText") as HTMLDivElement | null;
const userNotesInput = document.getElementById("userNotesInput") as HTMLInputElement | null;
const trackedItemsList = document.getElementById("trackedItemsList") as HTMLDivElement | null;
const clearAllButton = document.getElementById("clearAllButton") as HTMLButtonElement | null;

// State
let authToken: string | undefined;

async function updateUIState() {
  const { session } = await getSession();
  if (session) {
    authToken = session.access_token;
    authContainer.classList.add("hidden");
    mainContainer.classList.remove("hidden");
    renderTrackedItems();
  } else {
    authToken = undefined;
    authContainer.classList.remove("hidden");
    mainContainer.classList.add("hidden");
  }
}

// Auth Handlers
toggleAuthModeLink?.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentAuthMode === AuthMode.SIGN_IN) {
        currentAuthMode = AuthMode.SIGN_UP;
        if (authButton) authButton.textContent = "Sign Up";
        if (toggleAuthModeLink) toggleAuthModeLink.textContent = "Already have an account? Sign In";
    } else {
        currentAuthMode = AuthMode.SIGN_IN;
        if (authButton) authButton.textContent = "Sign In";
        if (toggleAuthModeLink) toggleAuthModeLink.textContent = "Need an account? Sign Up";
    }
    if (authMessage) authMessage.textContent = "";
});

authForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!emailInput || !emailInput.value || !passwordInput || !passwordInput.value) {
    if (authMessage) authMessage.textContent = "Please enter both email and password.";
    return;
  }
  
  const email = emailInput.value;
  const password = passwordInput.value;
  
  if (authMessage) {
      authMessage.textContent = currentAuthMode === AuthMode.SIGN_IN ? "Signing in..." : "Signing up...";
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
                   authMessage.textContent = "Account created! Please check your email to confirm.";
                   authMessage.style.color = "var(--primary)";
               }
               return;
           }
      }
      updateUIState();
    }
  } catch (err: any) { // Capture unexpected errors (e.g. network issues)
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
    await chrome.tabs.sendMessage(tabId, { type: "PING_PRICE_PICKER" } as RuntimeMessage);
    return;
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "PING_PRICE_PICKER" } as RuntimeMessage);
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
  
  trackedItemsList.innerHTML = `
    <div style="display: flex; justify-content: center; padding: 20px;">
      <div class="loader"></div>
    </div>
  `;

  let trackedItems: TrackedItem[] = [];
  try {
    const res = await authenticatedFetch("http://localhost:8080/items");
    if (!res.ok) {
        if (res.status === 401) {
            await signOut();
            await updateUIState();
            if (authMessage) {
                authMessage.textContent = "Session expired or invalid. Please log in again.";
                authMessage.style.color = "var(--danger)";
            }
            return;
        }
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    trackedItems = await res.json();
  } catch (err) {
    console.error("Failed to fetch from backend:", err);
    if (statusText) statusText.textContent = "Error: Could not connect to backend.";
    trackedItemsList.innerHTML = `<div class="muted" style="text-align:center; padding: 24px;">Failed to load items.</div>`;
    return; 
  }
  
  trackedItemsList.innerHTML = "";

  if (!trackedItems || trackedItems.length === 0) {
    trackedItemsList.innerHTML = '<div class="muted" style="text-align:center; padding: 24px;">No items tracked yet.</div>';
    return;
  }

  for (const item of trackedItems) {
    const itemElement = document.createElement("div");
    itemElement.className = "tracked-item";
    
    // Safety check for image URL
    const imgHtml = item.imageUrl 
      ? `<img class="thumb" src="${item.imageUrl}" alt="Product Image" />` 
      : `<div class="thumb" style="display: flex; align-items: center; justify-content: center; color: #cbd5e1;">📷</div>`;

    itemElement.innerHTML = `
      <div class="item-content">
        ${imgHtml}
        <div class="details">
          <a href="${item.pageUrl}" target="_blank" title="${item.productName || "Untitled"}">${item.productName || "Untitled"}</a>
          <span class="price">${item.priceText}</span>
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
}

startPickerButton?.addEventListener("click", async () => {
    if (statusText) statusText.textContent = "Activating picker...";
  const tabId = await getActiveTabId();
  if (!tabId) {
    if (statusText) statusText.textContent = "No active tab.";
    return;
  }
  try {
    await chrome.storage.local.set({ pendingUserNotes: userNotesInput?.value?.trim() ?? "" });
    
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "START_PRICE_PICK" } as RuntimeMessage);
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
        await authenticatedFetch("http://localhost:8080/items", { method: "DELETE" });
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
    
    try {
        await authenticatedFetch(`http://localhost:8080/items/${id}`, {
            method: "DELETE"
        });
        await renderTrackedItems();
    } catch (err) {
        console.error("Failed to delete item", err);
    }
  }
});

document.addEventListener("DOMContentLoaded", updateUIState);
