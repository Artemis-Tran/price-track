import os
import json
import time
import csv
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

import pandas as pd
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
from kernel import Kernel

DATA_DIR = Path("data")
SNAPSHOT_DIR = DATA_DIR / "snapshots"
CSV_PATH = DATA_DIR / "prices.csv"

DEFAULT_NAV_TIMEOUT_MS = 30000
DEFAULT_SELECTOR_TIMEOUT_MS = 15000
BROWSER_VIEWPORT = {"width": 1280, "height": 800}

# ---------- site-specific extractors ----------
async def extract_books_to_scrape(page):
    # Example legal demo site
    # Price looks like "£51.77" in CSS ".price_color"
    title = await page.locator("div.product_main h1").text_content()
    raw_price = await page.locator(".price_color").text_content()
    numeric_price = float(raw_price.replace("£", "").strip())
    return title.strip(), numeric_price

async def extract_opencart_demo(page):
    # Demo OpenCart
    title = await page.locator("div#content h1").first.text_content()
    raw_price = await page.locator("ul.list-unstyled h2").first.text_content()
    numeric_price = float(raw_price.replace("$", "").strip())
    return title.strip(), numeric_price

EXTRACTORS = {
    "books_to_scrape": extract_books_to_scrape,
    "opencart_demo": extract_opencart_demo,
}

# ---------- helpers ----------
def ensure_storage():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    if not CSV_PATH.exists():
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["timestamp_iso", "product_name", "page_title", "url", "price", "target_price", "screenshot_path"])

def load_products(path="products.json"):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def now_iso():
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

async def notify_if_needed(product_name, url, page_title, price, target_price):
    # Slack webhook (optional)
    webhook = os.getenv("SLACK_WEBHOOK", "").strip()
    if webhook and price <= target_price:
        import requests  # only used if webhook set
        message = f"Price alert: {product_name} is {price:.2f} (target {target_price:.2f})\n{url}"
        try:
            requests.post(webhook, json={"text": message}, timeout=10)
        except Exception as e:
            print(f"[warn] Slack notify failed: {e}")

async def extract_with_retry(page, extractor, attempts=2):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return await extractor(page)
        except PlaywrightTimeoutError as e:
            last_error = e
            await page.wait_for_timeout(1000)
        except Exception as e:
            last_error = e
            await page.wait_for_timeout(1000)
    raise last_error

async def track_once(kernel_browser_ws_url, products):
    ensure_storage()

    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(kernel_browser_ws_url)
        try:
            context = await browser.new_context(viewport=BROWSER_VIEWPORT, user_agent="Mozilla/5.0 (compatible; PriceTracker/1.0)")
            page = await context.new_page()

            for product in products:
                product_name = product["name"]
                product_url = product["url"]
                target_price = float(product["target_price"])
                site = product["site"]

                extractor = EXTRACTORS.get(site)
                if extractor is None:
                    print(f"[skip] No extractor for site '{site}' ({product_name})")
                    continue

                print(f"[info] Visiting: {product_url}")
                try:
                    await page.goto(product_url, timeout=DEFAULT_NAV_TIMEOUT_MS, wait_until="domcontentloaded")
                    await page.wait_for_load_state("networkidle", timeout=DEFAULT_SELECTOR_TIMEOUT_MS)

                    page_title, current_price = await extract_with_retry(page, extractor)

                    timestamp = now_iso()
                    screenshot_file = SNAPSHOT_DIR / f"{int(time.time())}_{site}.png"
                    await page.screenshot(path=str(screenshot_file), full_page=True)

                    with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
                        writer = csv.writer(f)
                        writer.writerow([timestamp, product_name, page_title, product_url, f"{current_price:.2f}", f"{target_price:.2f}", str(screenshot_file)])

                    print(f"[ok] {product_name} | {current_price:.2f} (target {target_price:.2f})")
                    await notify_if_needed(product_name, product_url, page_title, current_price, target_price)

                except Exception as e:
                    print(f"[error] {product_name}: {e}")

        finally:
            await browser.close()

def pretty_print_last_results(rows=10):
    if CSV_PATH.exists():
        df = pd.read_csv(CSV_PATH)
        print(df.tail(rows).to_string(index=False))
    else:
        print("[info] No CSV yet.")

async def main():
    load_dotenv()
    kernel = Kernel()

    # Launch a fresh Kernel browser each run (reuse sessions later if needed)
    kernel_browser = kernel.browsers.create()
    kernel_ws = kernel_browser["cdp_ws_url"] if isinstance(kernel_browser, dict) else kernel_browser.cdp_ws_url

    products = load_products()
    await track_once(kernel_ws, products)
    pretty_print_last_results()

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
