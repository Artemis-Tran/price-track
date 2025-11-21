import type { RuntimeMessage, PricePickPayload } from "./types";

let pickerActive = false;
let hoverOverlay: HTMLDivElement | null = null;

function createHoverOverlay(): HTMLDivElement {
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
  } as CSSStyleDeclaration);
  document.documentElement.appendChild(overlay);
  return overlay;
}

function updateOverlayForElement(element: Element): void {
  const rect = element.getBoundingClientRect();
  if (!hoverOverlay) return;
  Object.assign(hoverOverlay.style, {
    top: `${window.scrollY + rect.top}px`,
    left: `${window.scrollX + rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  });
}

function isIdUnique(id: string): boolean {
  try {
    const el = document.getElementById(id);
    return !!el;
  } catch {
    return false;
  }
}

function cssEscapeSimple(input: string): string {
  return input.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function getCssSelector(element: Element): string {
  const el = element as HTMLElement;
  if (el.id && isIdUnique(el.id)) {
    return `#${cssEscapeSimple(el.id)}`;
  }
  const parts: string[] = [];
  let current: Element | null = el;
  let depth = 0;

  while (current && depth < 8) {
    const tag = current.tagName.toLowerCase();
    const classList = Array.from((current as HTMLElement).classList || []).filter(
      (c) => c && c.length <= 32 && !/\d{4,}/.test(c)
    );
    let selector = tag;
    if (classList.length) {
      selector += "." + classList.map(cssEscapeSimple).join(".");
    }
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (child) => (child as Element).tagName === current!.tagName
      );
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current as HTMLElement) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    const partial = parts.join(" > ");
    try {
      if (document.querySelectorAll(partial).length === 1) {
        return partial;
      }
    } catch {
      // ignore invalid intermediate selectors
    }
    current = parent;
    depth++;
  }
  return parts.join(" > ");
}

function xpathEscapeSimple(input: string): string {
  return input.replace(/"/g, '\\"');
}

function getXPath(element: Element): string {
  const el = element as HTMLElement;
  if (el.id && isIdUnique(el.id)) {
    return `//*[@id="${xpathEscapeSimple(el.id)}"]`;
  }
  const parts: string[] = [];
  let node: Node | null = el;

  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const elementNode = node as Element;
    let index = 1;
    let sibling: Node | null = elementNode.previousSibling;
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && (sibling as Element).nodeName === elementNode.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    parts.unshift(`${elementNode.nodeName.toLowerCase()}[${index}]`);
    node = elementNode.parentNode;
  }
  return "/" + parts.join("/");
}

function extractPriceText(element: Element): string {
  const raw = ((element as HTMLElement).innerText || element.textContent || "").trim();
  const m = raw.match(
    /([€£¥₹]|US?\$)\s?\d[\d,]*(?:\.\d{2})?|\d[\d,]*(?:\.\d{2})?\s?(USD|EUR|GBP|JPY|INR)/i
  );
  return m ? m[0] : raw;
}

function getOuterHtmlSnippet(element: Element, maxLength = 800): string {
  const html = (element as HTMLElement).outerHTML ?? "";
  return html.length > maxLength ? html.slice(0, maxLength) + "…(truncated)" : html;
}

function onMouseMove(event: MouseEvent): void {
  if (!pickerActive) return;
  const element = event.target as Element | null;
  if (!element) return;
  updateOverlayForElement(element);
}

function onClick(event: MouseEvent): void {
  if (!pickerActive) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  const element = event.target as Element;
  cleanupPicker();

  const payload: PricePickPayload = {
    priceText: extractPriceText(element),
    cssSelector: getCssSelector(element),
    xPath: getXPath(element),
    pageUrl: location.href,
    outerHtmlSnippet: getOuterHtmlSnippet(element),
    capturedAtIso: new Date().toISOString()
  };

  chrome.runtime.sendMessage({ type: "PRICE_PICKED", payload } as RuntimeMessage);
}

function onKeyDown(event: KeyboardEvent): void {
  if (!pickerActive) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cleanupPicker();
    chrome.runtime.sendMessage({ type: "PRICE_PICK_CANCELLED" } as RuntimeMessage);
  }
}

function startPicker(): void {
  if (pickerActive) return;
  pickerActive = true;
  hoverOverlay = createHoverOverlay();
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

function cleanupPicker(): void {
  if (!pickerActive) return;
  pickerActive = false;
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);
  if (hoverOverlay?.parentNode) hoverOverlay.parentNode.removeChild(hoverOverlay);
  hoverOverlay = null;
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "PING_PRICE_PICKER") {
    sendResponse?.({ ok: true });
  }
  if (message.type === "START_PRICE_PICK") {
    startPicker();
  }
  // Return true if you plan to call sendResponse asynchronously
  return false;
});
