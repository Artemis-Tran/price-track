import type { RuntimeMessage, PricePickPayload } from "./types";

let pickerActive = false;
let hoverOverlay: HTMLDivElement | null = null;

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

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
  let bestUnique: string[] | null = null;
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
        bestUnique = parts.slice();
      }
    } catch {
      // ignore invalid intermediate selectors
    }
    current = parent;
    depth++;
  }
  if (bestUnique) {
    return bestUnique.join(" > ");
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

function isValidPrice(text: string): boolean {
  const symbolMatch = /([$€£¥₹]|US?\$)\s*\d[\d,]*(?:\.\d{2})?/.test(text);
  const codeMatch = /\d[\d,]*(?:\.\d{2})?\s*(USD|EUR|GBP|JPY|INR)/i.test(text);
  return symbolMatch || codeMatch;
}

function extractPriceText(element: Element): string {
  const raw = ((element as HTMLElement).innerText || element.textContent || "").trim();
  const symbolMatch = raw.match(/([€£¥₹]|US?\$)\s*\d[\d,]*(?:\.\d{2})?/);
  if (symbolMatch?.[0]) {
    return symbolMatch[0].replace(/\s+/g, "");
  }
  const codeMatch = raw.match(/\d[\d,]*(?:\.\d{2})?\s*(USD|EUR|GBP|JPY|INR)/i);
  if (codeMatch?.[0]) {
    return codeMatch[0].replace(/\s+/g, "");
  }
  return raw.replace(/\s+/g, "");
}

function resolveUrlMaybe(url: string | undefined | null): string {
  if (!url) return "";
  try {
    return new URL(url, location.href).toString();
  } catch {
    return url;
  }
}

function parseJsonLdProduct(): { name?: string; image?: string } | null {
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'));
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || "null");
      if (!data) continue;
      const maybeArray = Array.isArray(data) ? data : [data];
      for (const entry of maybeArray) {
        if (!entry || typeof entry !== "object") continue;
        if (entry["@type"] === "Product" || (Array.isArray(entry["@type"]) && entry["@type"].includes("Product"))) {
          const image = Array.isArray(entry.image) ? entry.image[0] : entry.image;
          return { name: entry.name, image };
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return null;
}

function getOgMetaContent(property: string): string {
  const el = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  return (el && el.getAttribute("content")) || "";
}

function findCandidateContainer(element: Element): Element | null {
  const priorityClasses = ["product", "item", "card", "listing", "entry", "detail"];
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 6) {
    const tag = current.tagName.toLowerCase();
    const classHit = priorityClasses.some((c) => current!.className && current!.className.toLowerCase().includes(c));
    if (classHit || tag === "article" || tag === "li" || tag === "section") {
      return current;
    }
    current = current.parentElement;
    depth++;
  }
  return element.parentElement;
}

function pickProductName(element: Element): string {
  const jsonLd = parseJsonLdProduct();
  if (jsonLd?.name) return String(jsonLd.name).trim();

  const ogTitle = getOgMetaContent("og:title").trim();
  if (ogTitle) return ogTitle;

  const container = findCandidateContainer(element) || document.body;
  const nameCandidates = Array.from(
    container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,[itemprop="name"],.title,.product-title,.product_name')
  );
  for (const node of nameCandidates) {
    const text = (node.innerText || node.textContent || "").trim();
    if (text) return text;
  }

  const docTitle = (document.title || "").trim();
  return docTitle;
}

function distance(a: DOMRect, b: DOMRect): number {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2;
  const by = b.top + b.height / 2;
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickProductImage(element: Element): string {
  const jsonLd = parseJsonLdProduct();
  if (jsonLd?.image) return resolveUrlMaybe(jsonLd.image as string);

  const ogImage = getOgMetaContent("og:image");
  if (ogImage) return resolveUrlMaybe(ogImage);

  const container = findCandidateContainer(element) || document.body;
  const images = Array.from(container.querySelectorAll<HTMLImageElement>("img")).filter((img) => {
    const { width, height } = img.getBoundingClientRect();
    return width >= 40 && height >= 40;
  });
  if (!images.length) return "";
  const priceRect = element.getBoundingClientRect();
  let best: { img: HTMLImageElement; score: number } | null = null;
  for (const img of images) {
    const rect = img.getBoundingClientRect();
    const dist = distance(priceRect, rect);
    const area = rect.width * rect.height;
    // favor closer images; subtract a small area factor to prefer larger images at similar distance
    const score = dist - Math.min(area, 50000) / 10000;
    if (!best || score < best.score) {
      best = { img, score };
    }
  }
  if (best?.img) {
    return resolveUrlMaybe(best.img.currentSrc || best.img.src);
  }
  return "";
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
  const priceText = extractPriceText(element);
  if (!isValidPrice(priceText)) {
    alert("Please select a valid price element.");
    return;
  }
  cleanupPicker();

  const payload: PricePickPayload = {
    priceText: priceText,
    productName: truncate(pickProductName(element), 70),
    imageUrl: pickProductImage(element),
    cssSelector: getCssSelector(element),
    xPath: getXPath(element),
    pageUrl: location.href,
    outerHtmlSnippet: getOuterHtmlSnippet(element),
    capturedAtIso: new Date().toISOString()
  };

  // Debug log to validate selector/xpath correctness while testing
  console.log("[price-track] picked element", {
    productName: payload.productName,
    imageUrl: payload.imageUrl,
    cssSelector: payload.cssSelector,
    xPath: payload.xPath,
    priceText: payload.priceText,
    pageUrl: payload.pageUrl
  });

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
