// Lightweight element picker injected on demand.
// Esc to cancel, click to capture.

let pickerActive = false;
let hoverOverlay = null;
let lastHoveredElement = null;

function createHoverOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "__price_picker_overlay__";
  Object.assign(overlay.style, {
    position: "absolute",
    pointerEvents: "none",
    border: "2px solid rgba(229, 62, 62, 0.9)",
    outline: "2000px solid rgba(229, 62, 62, 0.1)",
    borderRadius: "4px",
    zIndex: "2147483647",
    top: "0px",
    left: "0px",
    width: "0px",
    height: "0px",
    boxSizing: "border-box",
    transition: "all 60ms ease-out"
  });
  document.documentElement.appendChild(overlay);
  return overlay;
}

function updateOverlayForElement(element) {
  const rect = element.getBoundingClientRect();
  Object.assign(hoverOverlay.style, {
    top: `${window.scrollY + rect.top}px`,
    left: `${window.scrollX + rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  });
}

function getCssSelector(element) {
  // Heuristic: prefer id; otherwise build from classes and nth-of-type.
  if (element.id && isIdUnique(element.id)) {
    return `#${cssEscape(element.id)}`;
  }
  const path = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && path.length < 8) {
    let selector = current.nodeName.toLowerCase();

    // Stable class tokens (avoid long hashes)
    const classList = Array.from(current.classList || []).filter(c => c && c.length <= 32 && !/\d{4,}/.test(c));
    if (classList.length) {
      selector += "." + classList.map(cssEscape).join(".");
    }

    // Only add nth-of-type when needed
    const parent = current.parentElement;
    if (parent) {
      const tagName = current.tagName;
      const sameTagSiblings = Array.from(parent.children).filter(el => el.tagName === tagName);
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);

    // Stop early if this partial path is unique
    const partial = path.join(" > ");
    try {
      if (document.querySelectorAll(partial).length === 1) {
        return partial;
      }
    } catch {
      // ignore selector errors; continue building
    }

    current = parent;
  }
  return path.join(" > ");
}

function getXPath(element) {
  if (element.id && isIdUnique(element.id)) {
    return `//*[@id="${xpathEscape(element.id)}"]`;
  }
  const parts = [];
  let node = element;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = node.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === node.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    const tag = node.nodeName.toLowerCase();
    parts.unshift(`${tag}[${index}]`);
    node = node.parentNode;
  }
  return "/" + parts.join("/");
}

function cssEscape(s) {
  // Minimal escape; ok for ids/classes in this context
  return s.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function xpathEscape(s) {
  return s.replace(/"/g, '\\"');
}

function isIdUnique(id) {
  try {
    const el = document.getElementById(id);
    return el ? true : false; // DOM should guarantee uniqueness of ids
  } catch {
    return false;
  }
}

function extractPriceText(element) {
  // Default: innerText trimmed
  const text = (element.innerText || element.textContent || "").trim();
  // Optional: try to pick the most price-looking token
  const matches = text.match(/([€£¥₹]|US?\$)\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s?(USD|EUR|GBP|JPY|INR)/i);
  return matches ? matches[0] : text;
}

function getOuterHtmlSnippet(element, maxLength = 800) {
  const html = element.outerHTML || "";
  return html.length > maxLength ? html.slice(0, maxLength) + "…(truncated)" : html;
}

function onMouseMove(event) {
  if (!pickerActive) return;
  const element = event.target;
  if (!(element instanceof Element)) return;
  lastHoveredElement = element;
  updateOverlayForElement(element);
}

function onClick(event) {
  if (!pickerActive) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const element = event.target;
  cleanupPicker();

  const payload = {
    priceText: extractPriceText(element),
    cssSelector: getCssSelector(element),
    xPath: getXPath(element),
    pageUrl: location.href,
    outerHtmlSnippet: getOuterHtmlSnippet(element),
    capturedAtIso: new Date().toISOString()
  };

  chrome.runtime.sendMessage({ type: "PRICE_PICKED", payload });
}

function onKeyDown(event) {
  if (!pickerActive) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cleanupPicker();
    chrome.runtime.sendMessage({ type: "PRICE_PICK_CANCELLED" });
  }
}

function startPicker() {
  if (pickerActive) return;
  pickerActive = true;

  hoverOverlay = createHoverOverlay();
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

function cleanupPicker() {
  if (!pickerActive) return;
  pickerActive = false;

  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);

  if (hoverOverlay && hoverOverlay.parentNode) {
    hoverOverlay.parentNode.removeChild(hoverOverlay);
  }
  hoverOverlay = null;
  lastHoveredElement = null;
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING_PRICE_PICKER") {
    sendResponse && sendResponse({ ok: true });
  }
  if (message.type === "START_PRICE_PICK") {
    startPicker();
  }
});
