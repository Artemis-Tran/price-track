package scheduler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestScrapePrice_HTTP_CSS(t *testing.T) {
	// Mock server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<html><body><div class="price">$19.99</div></body></html>`))
	}))
	defer ts.Close()

	scraper := NewScraper()
	price, err := scraper.ScrapePrice(ts.URL, ".price", "")
	if err != nil {
		t.Fatalf("ScrapePrice failed: %v", err)
	}

	if price != "$19.99" {
		t.Errorf("Expected $19.99, got %s", price)
	}
}

func TestScrapePrice_HTTP_XPath(t *testing.T) {
	// Mock server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<html><body><div id="p">$20.00</div></body></html>`))
	}))
	defer ts.Close()

	scraper := NewScraper()
	price, err := scraper.ScrapePrice(ts.URL, "", "//div[@id='p']")
	if err != nil {
		t.Fatalf("ScrapePrice failed: %v", err)
	}

	if price != "$20.00" {
		t.Errorf("Expected $20.00, got %s", price)
	}
}

// Integration tests for live sites (skip in CI)
// To run: go test -v -run TestScrapePrice_Live ./internal/scheduler/...

func TestScrapePrice_Live_Amazon(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping live test in short mode")
	}

	scraper := NewScraper()
	defer scraper.Stop()

	if err := scraper.Start(); err != nil {
		t.Fatalf("Failed to start scraper: %v", err)
	}

	// Test with a known product (may need updating if product becomes unavailable)
	url := "https://www.amazon.com/dp/B0BD7Z94ZQ"
	price, err := scraper.ScrapePrice(url, ".a-price .a-offscreen", "")
	if err != nil {
		t.Fatalf("Failed to scrape Amazon: %v", err)
	}

	if price == "" {
		t.Error("Expected a price, got empty string")
	}
	t.Logf("Amazon price: %s", price)
}

func TestScrapePrice_Live_Uniqlo(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping live test in short mode")
	}

	scraper := NewScraper()
	defer scraper.Stop()

	if err := scraper.Start(); err != nil {
		t.Fatalf("Failed to start scraper: %v", err)
	}

	url := "https://www.uniqlo.com/us/en/products/E465185-000/00?colorDisplayCode=11&sizeDisplayCode=003"
	price, err := scraper.ScrapePrice(url, "p.fr-ec-price-text", "")
	if err != nil {
		t.Fatalf("Failed to scrape Uniqlo: %v", err)
	}

	if price == "" {
		t.Error("Expected a price, got empty string")
	}
	t.Logf("Uniqlo price: %s", price)
}
