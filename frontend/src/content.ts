import type { RuntimeMessage, PricePickPayload } from "./types";

let pickerActive = false;
let hoverOverlay: HTMLDivElement | null = null;

/**
 * Truncates a string to a maximum length, appending an ellipsis if truncated.
 * @param str The string to truncate.
 * @param maxLength The maximum length of the string.
 * @returns The truncated string.
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Creates and injects the hover overlay elemen t into the page.
 * This overlay highlights the element the user is currently hovering over.
 * @returns The created overlay element.
 */
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

/**
 * Moves and resizes the hover overlay to match the dimensions and position of a given element.
 * @param element The element to position the overlay over.
 */
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

/**
 * Escapes a string for use in an XPath expression.
 * @param input The string to escape.
 * @returns The escaped string.
 */
function xpathEscapeSimple(input: string): string {
  return input.replace(/"/g, '\\"');
}

/**
 * Generates an XPath for a given element.
 * @param element The element to generate an XPath for.
 * @returns An XPath string.
 */
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


/**
 * Checks if a string looks like a valid price.
 * @param text The string to check.
 * @returns True if the string is a valid price, false otherwise.
 */
import { isValidPrice, extractPriceText, getCssSelector, cssEscapeSimple, isIdUnique } from "./utils";

/**
 * Resolves a URL against the current page's URL.
 * @param url The URL to resolve.
 * @returns The resolved URL.
 */
function resolveUrlMaybe(url: string | undefined | null): string {
  if (!url) return "";
  try {
    return new URL(url, location.href).toString();
  } catch {
    return url;
  }
}

/**
 * Parses JSON-LD scripts in the page to find product information.
 * @returns The product name and image, or null if not found.
 */
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

/**
 * Gets the content of an Open Graph meta tag.
 * @param property The Open Graph property to get.
 * @returns The content of the meta tag.
 */
function getOgMetaContent(property: string): string {
  const el = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  return (el && el.getAttribute("content")) || "";
}

/**
 * Finds a candidate container element for a given element.
 * This is used to find the parent element that contains the product information.
 * @param element The element to find the container for.
 * @returns The container element, or null if not found.
 */
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

/**
 * Tries to determine the product name from the page.
 * Uses JSON-LD, Open Graph, and heading elements.
 * @param element The element that was clicked.
 * @returns The product name.
 */
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

/**
 * Calculates the distance between two DOM rectangles.
 * @param a The first rectangle.
 * @param b The second rectangle.
 * @returns The distance between the centers of the two rectangles.
 */
function distance(a: DOMRect, b: DOMRect): number {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2;
  const by = b.top + b.height / 2;
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Tries to find the best product image on the page.
 * Uses JSON-LD, Open Graph, and image elements near the clicked element.
 * @param element The element that was clicked.
 * @returns The URL of the product image.
 */
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

/**
 * Gets a snippet of the outer HTML of an element.
 * @param element The element to get the HTML from.
 * @param maxLength The maximum length of the snippet.
 * @returns The HTML snippet.
 */
function getOuterHtmlSnippet(element: Element, maxLength = 800): string {
  const html = (element as HTMLElement).outerHTML ?? "";
  return html.length > maxLength ? html.slice(0, maxLength) + "…(truncated)" : html;
}

/**
 * Handles the mouse move event to update the hover overlay.
 * @param event The mouse move event.
 */
function onMouseMove(event: MouseEvent): void {
  if (!pickerActive) return;
  const element = event.target as Element | null;
  if (!element) return;
  updateOverlayForElement(element);
}

/**
 * Handles the click event to select a price.
 * @param event The click event.
 */
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

/**
 * Handles the key down event to cancel the price picker.
 * @param event The key down event.
 */
function onKeyDown(event: KeyboardEvent): void {
  if (!pickerActive) return;
  if (event.key === "Escape") {
    event.preventDefault();
    cleanupPicker();
    chrome.runtime.sendMessage({ type: "PRICE_PICK_CANCELLED" } as RuntimeMessage);
  }
}

/**
 * Starts the price picker.
 * This adds the hover overlay and event listeners.
 */
function startPicker(): void {
  if (pickerActive) return;
  pickerActive = true;
  hoverOverlay = createHoverOverlay();
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
}

/**
 * Stops the price picker.
 * This removes the hover overlay and event listeners.
 */
function cleanupPicker(): void {
  if (!pickerActive) return;
  pickerActive = false;
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);
  if (hoverOverlay?.parentNode) hoverOverlay.parentNode.removeChild(hoverOverlay);
  hoverOverlay = null;
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
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
}
