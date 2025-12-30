package scheduler

import (
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/antchfx/htmlquery"
)

type Scheduler struct {
	db *sql.DB
}

func New(db *sql.DB) *Scheduler {
	return &Scheduler{db: db}
}

func (s *Scheduler) Start() {
	// Ticker for checking prices.
	// For production, this might be 1 hour. For testing/demo, we'll set it to 10 minutes.
	// Or even shorter if we want to see it iterate.
	// Let's go with 1 hour as a reasonable default, but check immediately on start?
	// The prompt implies it runs periodically.
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	slog.Info("Scheduler started, checking prices every 1 hour")

	// Trigger an immediate check in a goroutine so we don't block start
	go s.checkPrices()

	for range ticker.C {
		s.checkPrices()
	}
}

func (s *Scheduler) checkPrices() {
	slog.Info("Checking prices for all tracked items...")

	// 1. Fetch all tracked items
	// We need user_id to send notification
	rows, err := s.db.Query(`
		SELECT id, user_id, price_text, product_name, page_url, css_selector, xpath 
		FROM tracked_items
	`)
	if err != nil {
		slog.Error("Failed to fetch tracked items", "error", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, userID, priceText, productName, pageURL, cssSelector, xpath string
		if err := rows.Scan(&id, &userID, &priceText, &productName, &pageURL, &cssSelector, &xpath); err != nil {
			slog.Error("Failed to scan item", "error", err)
			continue
		}

		go s.processItem(id, userID, priceText, productName, pageURL, cssSelector, xpath)
	}
}

func (s *Scheduler) processItem(id, userID, oldPriceText, productName, pageURL, cssSelector, xpathSelector string) {
	// Scrape new price
	newPriceText, err := s.scrapePrice(pageURL, cssSelector, xpathSelector)
	if err != nil {
		slog.Error("Failed to scrape price", "id", id, "url", pageURL, "error", err)
		return
	}

	// Compare prices
	oldPrice, err := parsePrice(oldPriceText)
	if err != nil {
		slog.Warn("Failed to parse old price", "price", oldPriceText, "error", err)
		return
	}

	newPrice, err := parsePrice(newPriceText)
	if err != nil {
		slog.Warn("Failed to parse new price", "price", newPriceText, "error", err)
		return
	}

	// Update the last captured price in DB?
	// The prompt says "if the price has decreased ... send a notification".
	// It doesn't explicitly say "update the price in the DB", but usually we should to avoid repeated notifications.
	// However, the prompt says "check the price again ... if the price has decreased from what the price ORIGINALLY was".
	// Depending on interpretation:
	// 1. Compare against the "saved" price (originally was).
	// 2. Compare against "last checked" price.
	// Prompt: "if the price has decreased from what the price originally was" implies we compare against `price_text` in DB.
	// So we don't necessarily update `price_text` immediately unless we want to reset the baseline?
	// Usually, if price drops, we notify.
	// Let's assume we notify if New < Old.

	if newPrice < oldPrice {
		slog.Info("Price drop detected!", "product", productName, "old", oldPrice, "new", newPrice)
		if err := s.sendNotification(userID, productName, oldPriceText, newPriceText, id); err != nil {
			slog.Error("Failed to send notification", "error", err)
		}
	} else {
		slog.Info("No price drop", "product", productName, "old", oldPrice, "new", newPrice)
	}
}

func (s *Scheduler) scrapePrice(url, cssSelector, xpathSelector string) (string, error) {
	// Create client with timeout
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	// Add user agent to avoid basic blocking
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; PriceTracker/1.0)")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("bad status code: %d", resp.StatusCode)
	}

	// Prioritize CSS selector as per prompt "find the Xpath OR the CSS selector... check the price again using the CSS selector"
	// Actually prompt said "find the Xpath or the CSS selector... check the price again using the CSS selector".
	// But later "Xpath or CSS".
	// Implementation: Try CSS if available, else XPath.

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

func (s *Scheduler) sendNotification(userID, productName, oldPrice, newPrice, productID string) error {
	title := "Price Drop Alert!"
	message := fmt.Sprintf("Good news! The price for '%s' dropped from %s to %s.", productName, oldPrice, newPrice)

	_, err := s.db.Exec(`
		INSERT INTO notifications (user_id, title, message, type, product_id)
		VALUES ($1, $2, $3, 'price_drop', $4)
	`, userID, title, message, productID)

	return err
}

func parsePrice(priceStr string) (float64, error) {
	// Remove anything that is not a digit or a dot
	re := regexp.MustCompile(`[^\d\.]`)
	cleaned := re.ReplaceAllString(priceStr, "")

	// Handle cases like "1,234.56" -> remove commas first?
	// The regex `[^\d\.]` removes commas.
	// So "1,234.56" becomes "1234.56" - correct.
	// "$10.99" -> "10.99" - correct.
	// "EUR 50" -> "50" - correct.

	// Edge case: multiple dots? "1.2.3".
	// For now, assume standard price format.

	return strconv.ParseFloat(cleaned, 64)
}
