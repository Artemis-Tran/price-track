const PRICE_REGEX = /([$€£¥₹]|US?\$)\s*\d[\d,]*\s*(?:\.\s*\d{2})?/;
const CURRENCY_CODE_REGEX = /\d[\d,]*(?:\.\d{2})?\s*(USD|EUR|GBP|JPY|INR)/i;

/**
 * Checks if a string looks like a valid price.
 * @param text The string to check.
 * @returns True if the string is a valid price, false otherwise.
 */
export function isValidPrice(text: string): boolean {
  const symbolMatch = PRICE_REGEX.test(text);
  const codeMatch = CURRENCY_CODE_REGEX.test(text);
  return symbolMatch || codeMatch;
}

/**
 * Extracts the price text from an element.
 * @param element The element to extract the price from.
 * @returns The extracted price text.
 */
export function extractPriceText(element: Element): string {
  const raw = (
    (element as HTMLElement).innerText ||
    element.textContent ||
    ""
  ).trim();
  const symbolMatch = raw.match(PRICE_REGEX);
  if (symbolMatch?.[0]) {
    return symbolMatch[0].replace(/\s+/g, "");
  }
  const codeMatch = raw.match(CURRENCY_CODE_REGEX);
  if (codeMatch?.[0]) {
    return codeMatch[0].replace(/\s+/g, "");
  }
  return raw.replace(/\s+/g, "");
}

/**
 * Checks if an element ID is unique in the document.
 * @param id The ID to check.
 * @returns True if the ID is unique, false otherwise.
 */
export function isIdUnique(id: string): boolean {
  try {
    const el = document.getElementById(id);
    return !!el;
  } catch {
    return false;
  }
}

/**
 * Escapes a string for use in a CSS selector.
 * @param input The string to escape.
 * @returns The escaped string.
 */
export function cssEscapeSimple(input: string): string {
  return input.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

/**
 * Generates a CSS selector for a given element.
 * Tries to find a unique selector using ID, classes, attributes, and tag names.
 * Prioritizes stable attributes and avoids fragile :nth-of-type selectors where possible.
 * @param element The element to generate a selector for.
 * @returns A CSS selector string.
 */
export function getCssSelector(element: Element): string {
  if (element.id && isIdUnique(element.id)) {
    return `#${cssEscapeSimple(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  // Attributes to prioritize for stability
  const stableAttributes = [
    "itemprop", // Common on e-commerce sites
    "data-testid",
    "data-hook", // Common on Amazon
    "data-a-input-name",
    "name",
    "role",
    "aria-label",
    "title",
    "alt",
    "placeholder",
    "data-id",
    "data-automation-id",
  ];

  while (current && depth < 10) {
    if (current.id && isIdUnique(current.id)) {
      parts.unshift(`#${cssEscapeSimple(current.id)}`);
      return parts.join(" > ");
    }

    const tag = current.tagName.toLowerCase();
    let selector = tag;

    for (const attr of stableAttributes) {
      if (current.hasAttribute(attr)) {
        const val = current.getAttribute(attr);
        // Skip attribute values that look like prices (contain currency symbols or "price")
        if (val && !/[$€£¥₹]|\bprice\b/i.test(val)) {
          selector += `[${attr}="${cssEscapeSimple(val)}"]`;
        }
      }
    }

    const classList = Array.from(current.classList || []).filter(
      (c) =>
        c &&
        c.length <= 40 &&
        !/^[0-9]+$/.test(c) &&
        !/^[a-z0-9]{20,}$/.test(c) &&
        !c.includes("--")
    );
    if (classList.length) {
      selector += "." + classList.map(cssEscapeSimple).join(".");
    }

    const parent: Element | null = current.parentElement;
    let needsNthType = false;

    if (parent) {
      const matchingSiblings = Array.from(parent.children).filter((child) => {
        if (child === current) return true;
        if (child.tagName.toLowerCase() !== tag) return false;

        for (const attr of stableAttributes) {
          if (current!.hasAttribute(attr)) {
            if (child.getAttribute(attr) !== current!.getAttribute(attr))
              return false;
          }
        }
        return classList.every((c) => child.classList.contains(c));
      });

      if (matchingSiblings.length > 1) {
        needsNthType = true;
      }
    }

    if (needsNthType) {
      const sameTagSiblings = parent
        ? Array.from(parent.children).filter(
            (c) => c.tagName === current!.tagName
          )
        : [];
      const index = sameTagSiblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    parts.unshift(selector);

    const fullSelector = parts.join(" > ");

    try {
      if (document.querySelectorAll(fullSelector).length === 1) {
        return fullSelector;
      }
    } catch {
      // ignore
    }

    current = parent;
    depth++;
  }

  return parts.join(" > ");
}

/**
 * Tries to find a better price element by looking at parents.
 * Useful when the user clicks on a fraction or symbol.
 * @param element The element that was clicked.
 * @returns The best candidate element for the price.
 */
export function findBestPriceElement(element: Element): Element {
  let current: Element | null = element;
  let best = element;
  let depth = 0;

  // Heuristic: Parents with specific classes or that contain the full price text
  // are likely better candidates.
  while (current && depth < 3) {
    if (current.classList.contains("a-price")) {
      return current;
    }

    // Check if parent has more valid price text
    const currentPrice = extractPriceText(best);
    const parentPrice = extractPriceText(current);

    if (!isValidPrice(currentPrice) && isValidPrice(parentPrice)) {
      best = current;
    } else if (isValidPrice(currentPrice) && isValidPrice(parentPrice)) {
      // If both are valid, prefer the one that is longer (more likely to be complete)
      // provided it doesn't become too long (like a whole card)
      if (parentPrice.length > currentPrice.length && parentPrice.length < 20) {
        best = current;
      }
    }

    current = current.parentElement;
    depth++;
  }
  return best;
}
