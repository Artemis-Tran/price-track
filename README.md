# Generalized Price Tracker (TS Starter)

A price tracking solution designed to monitor product prices across various websites. This project comprises a Chrome extension for frontend interaction and a Python script for backend web scraping and data management.

## Features

### Chrome Extension (Frontend)
*   **Browser Action Popup:** Provides a user interface accessible directly from the browser toolbar.
*   **Content Script:** Interacts with web pages to potentially extract product information or trigger tracking actions.
*   **Background Service Worker:** Handles background tasks and communication between different parts of the extension.

### Python Scraper (Backend)
*   **Web Scraping:** Utilizes Playwright to navigate to product URLs and extract price information.
*   **Site-Specific Extractors:** Configurable to handle different website structures for accurate price retrieval.
*   **Data Storage:** Stores historical price data, timestamps, product names, page titles, URLs, and screenshots in `data/prices.csv`.
*   **Screenshot Capture:** Automatically captures full-page screenshots during price checks for visual records.
*   **Price Alerts:** Sends optional Slack notifications when a product's current price meets or falls below a predefined target price.

## Technologies Used

### Frontend (Chrome Extension)
*   **TypeScript:** For type-safe and maintainable JavaScript.
*   **esbuild:** A fast bundler for the extension's JavaScript and TypeScript assets.
*   **Chrome Extension Manifest V3:** The latest platform for building secure and performant Chrome extensions.
*   **Chrome APIs:** `scripting`, `activeTab`, `tabs`, `storage` for extension functionality.

### Backend (Python Scraper)
*   **Python:** The primary language for the scraping logic.
*   **Playwright:** A powerful library for browser automation and web scraping.
*   **Pandas:** Used for convenient handling and display of CSV data.
*   **python-dotenv:** For managing environment variables (e.g., Slack webhook).
*   **`kernel` (Environment-Specific):** An assumed environment-specific component for browser interaction.

## Setup and Installation

### 1. Chrome Extension

#### Prerequisites
*   Node.js (LTS recommended)
*   npm (comes with Node.js)

#### Installation
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/price-track.git
    cd price-track
    ```
2.  **Install Node.js dependencies:**
    ```bash
    npm install
    ```
3.  **Build the extension:**
    ```bash
    npm run build
    ```
    This will compile the TypeScript files and place all necessary extension files into the `dist/` directory.
4.  **Load into Chrome:**
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Enable "Developer mode" using the toggle switch in the top right corner.
    *   Click on "Load unpacked" and select the `dist/` directory from your project.
    *   The "Generalized Price Tracker" extension should now appear in your list of extensions.

#### Development
For development with live reloading:
```bash
npm run dev
```
This will watch for changes in your source files and automatically rebuild the extension. You will still need to click the refresh button on the extension card in `chrome://extensions` to apply updates.

### 2. Python Scraper

#### Prerequisites
*   Python 3.8+
*   `pip` (Python package installer)

#### Installation
1.  **Navigate to the project root (if not already there):**
    ```bash
    cd price-track
    ```
2.  **Install Python dependencies:**
    ```bash
    pip install playwright pandas python-dotenv
    # If you plan to use Slack notifications:
    pip install requests
    ```
3.  **Install Playwright browser binaries:**
    ```bash
    playwright install
    ```

## Configuration

### `products.json`
The Python scraper requires a `products.json` file in the project root to define the products you want to track. Create this file with an array of product objects, each containing:
*   `"name"`: A descriptive name for the product.
*   `"url"`: The URL of the product page.
*   `"target_price"`: The price at which you want to be notified.
*   `"site"`: A key corresponding to an extractor function in `main.py` (e.g., `"books_to_scrape"`, `"opencart_demo"`). You may need to implement custom extractors for new sites.

Example `products.json`:
```json
[
  {
    "name": "Example Book",
    "url": "http://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
    "target_price": 50.00,
    "site": "books_to_scrape"
  },
  {
    "name": "OpenCart Demo Product",
    "url": "https://demo.opencart.com/index.php?route=product/product&product_id=43",
    "target_price": 100.00,
    "site": "opencart_demo"
  }
]
```

### Environment Variables (`.env`)
For Slack notifications, create a `.env` file in the project root with your Slack webhook URL:
```
SLACK_WEBHOOK="YOUR_SLACK_WEBHOOK_URL_HERE"
```

## Usage

### Chrome Extension
*   Click on the extension icon in your Chrome toolbar. The `popup.html` will appear, providing the extension's UI.
*   The content script (`content.js`) will run on all pages you visit, potentially interacting with the page content.
*   The background service worker (`background.js`) will handle events and messages in the background.

*(Further usage details for the extension would depend on its specific UI and functionality, which are not fully detailed in the provided files.)*

### Python Scraper
To run the price tracking script:
```bash
python main.py
```
This will:
1.  Load products from `products.json`.
2.  Connect to a browser instance (via the `kernel` component).
3.  Visit each product URL, extract its price, and take a screenshot.
4.  Append the tracking data to `data/prices.csv`.
5.  Print the last few tracking results to the console.
6.  Send Slack notifications if any product's price meets its target.

## Development

### Extending Site Extractors
To track products from new websites, you will need to:
1.  **Inspect the website:** Identify the HTML elements containing the product title and price.
2.  **Create a new extractor function:** In `main.py`, add a new `async` function similar to `extract_books_to_scrape` or `extract_opencart_demo`. This function should take a Playwright `page` object and return the product title (string) and numeric price (float).
3.  **Add to `EXTRACTORS` dictionary:** Map a unique `site` key to your new extractor function in the `EXTRACTORS` dictionary in `main.py`.
4.  **Update `products.json`:** Use your new `site` key for products from that website.

### Data Output
*   **`data/prices.csv`:** Contains all historical price tracking data.
*   **`data/snapshots/`:** Stores screenshots taken during each price check.

---
This `README.md` provides a comprehensive overview of the project.