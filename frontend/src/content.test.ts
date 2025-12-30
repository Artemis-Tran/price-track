
import { describe, it, expect, beforeEach } from 'vitest';
import { getCssSelector } from './utils';

describe('getCssSelector Robustness', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('should generate a robust selector that survives sibling insertion', () => {
        // Setup initial DOM (Simulating Amazon structure)
        document.body.innerHTML = `
            <div id="corePriceDisplay_desktop_feature_div">
                <div class="a-section a-spacing-none aok-align-center">
                    <span class="a-price aok-align-center" data-a-size="xl" data-a-color="base">
                       <span class="a-offscreen">$19.99</span>
                       <span aria-hidden="true">
                           <span class="a-price-symbol">$</span>
                           <span class="a-price-whole">19<span class="a-price-decimal">.</span></span>
                           <span class="a-price-fraction">99</span>
                       </span>
                    </span>
                </div>
            </div>
        `;

        const priceElement = document.querySelector('.a-price');
        expect(priceElement).not.toBeNull();
        if (!priceElement) return;

        // 1. Generate selector from original state
        const originalSelector = getCssSelector(priceElement);
        console.log('Generated Selector:', originalSelector);

        // Verify it works on initial state
        expect(document.querySelector(originalSelector)).toBe(priceElement);

        // 2. Mutate DOM: Insert a "Limited Time Deal" badge/banner before the price
        // This simulates Amazon adding a sale element that shifts indices
        const container = document.querySelector('.a-section');
        const badge = document.createElement('span');
        badge.className = 'a-badge-label';
        badge.innerText = 'Limited time deal';
        // Insert before the price element
        container?.insertBefore(badge, priceElement);

        // Verify structure changed (price is now 2nd child, not 1st)
        expect(priceElement.previousElementSibling).toBe(badge);

        // 3. Verify the ORIGINAL selector still finds the SAME element
        const foundElement = document.querySelector(originalSelector);
        expect(foundElement).toBe(priceElement);
    });

    it('should use itemprop for extra stability', () => {
         document.body.innerHTML = `
            <div class="product-info-main">
                <div class="price-box">
                    <span class="price" itemprop="price">99.00</span>
                </div>
            </div>
        `;
        const el = document.querySelector('[itemprop="price"]');
        if(!el) throw new Error("Setup failed");

        const selector = getCssSelector(el);
        console.log('Itemprop Selector:', selector);
        
        expect(selector).toContain('itemprop="price"');
        expect(document.querySelector(selector)).toBe(el);
    });
});

import { extractPriceText } from './utils';

describe('Price Extraction', () => {
    it('should correctly extract price from cluttered text', () => {
        const element = document.createElement('div');
        // Simulate the text that likely caused the issue (no spaces between price and text)
        element.textContent = '$159.99with10percentsavings-10%$159.99';
        
        const price = extractPriceText(element);
        expect(price).toBe('$159.99');
    });

    it('should correctly extract price with standard formatting', () => {
         const element = document.createElement('div');
         element.textContent = 'Price: $19.99';
         expect(extractPriceText(element)).toBe('$19.99');
    });
});
