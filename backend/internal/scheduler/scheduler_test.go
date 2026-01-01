package scheduler

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestScrapePrice_CSS(t *testing.T) {
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

func TestScrapePrice_XPath(t *testing.T) {
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

func TestParsePrice(t *testing.T) {
	tests := []struct {
		input    string
		expected float64
	}{
		{"$19.99", 19.99},
		{"20.00", 20.00},
		{"£1,234.56", 1234.56},
		{"Price: 50 USD", 50.00},
	}

	for _, test := range tests {
		got, err := parsePrice(test.input)
		if err != nil {
			t.Errorf("parsePrice(%q) error: %v", test.input, err)
			continue
		}
		if got != test.expected {
			t.Errorf("parsePrice(%q) = %f, expected %f", test.input, got, test.expected)
		}
	}
}
