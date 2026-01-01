package scheduler

import (
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/antchfx/htmlquery"
	"github.com/playwright-community/playwright-go"
)

// Scraper provides methods for scraping prices from web pages.
// It uses HTTP requests first (fast), and falls back to Playwright (headless browser)
// for JavaScript-heavy sites.
type Scraper struct {
	pw      *playwright.Playwright
	browser playwright.Browser
	mu      sync.Mutex
	started bool
}

// NewScraper creates a new Scraper instance.
func NewScraper() *Scraper {
	return &Scraper{}
}

// Start initializes the Playwright browser. Call this once at application startup.
func (s *Scraper) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.started {
		return nil
	}

	// Install browsers if needed (first run)
	if err := playwright.Install(); err != nil {
		return fmt.Errorf("could not install playwright: %w", err)
	}

	pw, err := playwright.Run()
	if err != nil {
		return fmt.Errorf("could not start playwright: %w", err)
	}
	s.pw = pw

	browser, err := pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{
		Headless: playwright.Bool(true),
	})
	if err != nil {
		pw.Stop()
		return fmt.Errorf("could not launch browser: %w", err)
	}
	s.browser = browser
	s.started = true

	slog.Info("Playwright browser started")
	return nil
}

// Stop closes the Playwright browser and cleans up resources.
func (s *Scraper) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.started {
		return
	}

	if s.browser != nil {
		s.browser.Close()
	}
	if s.pw != nil {
		s.pw.Stop()
	}
	s.started = false
	slog.Info("Playwright browser stopped")
}

// ScrapePrice attempts to scrape a price from a URL using the given selectors.
// It tries HTTP first (fast), then falls back to Playwright if element not found.
func (s *Scraper) ScrapePrice(url, cssSelector, xpathSelector string) (string, error) {
	// Try HTTP first (fast path)
	price, err := s.scrapePriceHTTP(url, cssSelector, xpathSelector)
	if err == nil {
		return price, nil
	}

	// If HTTP failed with "element not found", try Playwright
	if strings.Contains(err.Error(), "element not found") {
		slog.Info("HTTP scrape failed, trying Playwright", "url", url, "error", err)
		return s.scrapePricePlaywright(url, cssSelector)
	}

	return "", err
}

// scrapePriceHTTP uses standard HTTP GET + goquery/htmlquery (no JS execution)
func (s *Scraper) scrapePriceHTTP(url, cssSelector, xpathSelector string) (string, error) {
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("bad status code: %d", resp.StatusCode)
	}

	if cssSelector != "" {
		doc, err := goquery.NewDocumentFromReader(resp.Body)
		if err != nil {
			return "", err
		}
		selection := doc.Find(cssSelector).First()
		if selection.Length() == 0 {
			return "", fmt.Errorf("element not found with css selector: %s", cssSelector)
		}
		return strings.TrimSpace(selection.Text()), nil
	} else if xpathSelector != "" {
		doc, err := htmlquery.Parse(resp.Body)
		if err != nil {
			return "", err
		}
		node := htmlquery.FindOne(doc, xpathSelector)
		if node == nil {
			return "", fmt.Errorf("element not found with xpath: %s", xpathSelector)
		}
		return strings.TrimSpace(htmlquery.InnerText(node)), nil
	}

	return "", fmt.Errorf("no selector provided")
}

// scrapePricePlaywright uses a headless browser with stealth features to render JavaScript and extract price
func (s *Scraper) scrapePricePlaywright(url, cssSelector string) (string, error) {
	s.mu.Lock()
	if !s.started {
		s.mu.Unlock()
		if err := s.Start(); err != nil {
			return "", fmt.Errorf("failed to start playwright: %w", err)
		}
		s.mu.Lock()
	}
	browser := s.browser
	s.mu.Unlock()

	if cssSelector == "" {
		return "", fmt.Errorf("CSS selector required for Playwright scraping")
	}

	// Stealth: Create a context with realistic browser settings
	context, err := browser.NewContext(playwright.BrowserNewContextOptions{
		UserAgent: playwright.String("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
		Viewport: &playwright.Size{
			Width:  1920,
			Height: 1080,
		},
		Locale:            playwright.String("en-US"),
		TimezoneId:        playwright.String("America/Los_Angeles"),
		HasTouch:          playwright.Bool(false),
		JavaScriptEnabled: playwright.Bool(true),
		// Stealth: Spoof permissions and device features
		Permissions: []string{"geolocation"},
		ExtraHttpHeaders: map[string]string{
			"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
			"Accept-Language":           "en-US,en;q=0.9",
			"Accept-Encoding":           "gzip, deflate, br",
			"DNT":                       "1",
			"Connection":                "keep-alive",
			"Upgrade-Insecure-Requests": "1",
			"Sec-Fetch-Dest":            "document",
			"Sec-Fetch-Mode":            "navigate",
			"Sec-Fetch-Site":            "none",
			"Sec-Fetch-User":            "?1",
			"Cache-Control":             "max-age=0",
		},
	})
	if err != nil {
		return "", fmt.Errorf("could not create context: %w", err)
	}
	defer context.Close()

	page, err := context.NewPage()
	if err != nil {
		return "", fmt.Errorf("could not create page: %w", err)
	}
	defer page.Close()

	// Stealth: Override navigator.webdriver to hide automation
	err = page.AddInitScript(playwright.Script{
		Content: playwright.String(`
			// Override webdriver detection
			Object.defineProperty(navigator, 'webdriver', {
				get: () => undefined
			});
			
			// Override chrome detection
			window.chrome = {
				runtime: {},
				loadTimes: function() {},
				csi: function() {},
				app: {}
			};
			
			// Override plugins
			Object.defineProperty(navigator, 'plugins', {
				get: () => [
					{name: 'Chrome PDF Plugin'},
					{name: 'Chrome PDF Viewer'},
					{name: 'Native Client'}
				]
			});
			
			// Override languages
			Object.defineProperty(navigator, 'languages', {
				get: () => ['en-US', 'en']
			});
			
			// Override permissions API
			const originalQuery = window.navigator.permissions.query;
			window.navigator.permissions.query = (parameters) => (
				parameters.name === 'notifications' ?
					Promise.resolve({ state: Notification.permission }) :
					originalQuery(parameters)
			);
		`),
	})
	if err != nil {
		slog.Warn("Could not add stealth script", "error", err)
	}

	// Navigate to the page with domcontentloaded (faster than networkidle)
	_, err = page.Goto(url, playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateDomcontentloaded,
		Timeout:   playwright.Float(30000), // 30 second timeout
	})
	if err != nil {
		return "", fmt.Errorf("could not navigate to page: %w", err)
	}

	// Wait a bit for JS to render (random delay to appear human)
	time.Sleep(time.Duration(1000+rand.Intn(2000)) * time.Millisecond)

	// Wait for the selector to appear
	err = page.Locator(cssSelector).First().WaitFor(playwright.LocatorWaitForOptions{
		State:   playwright.WaitForSelectorStateVisible,
		Timeout: playwright.Float(15000), // 15 second timeout
	})
	if err != nil {
		// Debug: save screenshot on failure
		if _, screenshotErr := page.Screenshot(playwright.PageScreenshotOptions{
			Path: playwright.String("/tmp/debug_screenshot.png"),
		}); screenshotErr != nil {
			slog.Warn("Could not save debug screenshot", "error", screenshotErr)
		} else {
			slog.Info("Debug screenshot saved to /tmp/debug_screenshot.png")
		}
		return "", fmt.Errorf("element not found with css selector (Playwright): %s", cssSelector)
	}

	// Get the text content
	text, err := page.Locator(cssSelector).First().TextContent()
	if err != nil {
		return "", fmt.Errorf("could not get text content: %w", err)
	}

	return strings.TrimSpace(text), nil
}
