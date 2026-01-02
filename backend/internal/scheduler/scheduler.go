package scheduler

import (
	"database/sql"
	"fmt"
	"log/slog"
	"regexp"
	"strconv"
	"time"
)

type Scheduler struct {
	db      *sql.DB
	scraper *Scraper
}

func New(db *sql.DB) *Scheduler {
	return &Scheduler{
		db:      db,
		scraper: NewScraper(),
	}
}

func (s *Scheduler) Start() {
	// Start the Playwright scraper (lazy initialization on first use is also fine)
	if err := s.scraper.Start(); err != nil {
		slog.Warn("Failed to start Playwright scraper, will use HTTP only", "error", err)
	}

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	slog.Info("Scheduler started, checking prices every 1 hour")

	// Trigger an immediate check in a goroutine so we don't block start
	go s.checkPrices()

	for range ticker.C {
		s.checkPrices()
	}
}

// Stop cleans up resources (call this on application shutdown)
func (s *Scheduler) Stop() {
	s.scraper.Stop()
}

func (s *Scheduler) checkPrices() {
	slog.Info("Checking prices for all tracked items...")

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
	newPriceText, err := s.scraper.ScrapePrice(pageURL, cssSelector, xpathSelector)
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

	if newPrice < oldPrice {
		slog.Info("Price drop detected!", "product", productName, "old", oldPrice, "new", newPrice)

		if err := s.updateTrackedItemPrice(id, newPriceText); err != nil {
			slog.Error("Failed to update tracked item price", "id", id, "error", err)
		}

		if err := s.sendNotification(userID, productName, oldPriceText, newPriceText, id); err != nil {
			slog.Error("Failed to send notification", "error", err)
		}
	} else if newPrice > oldPrice {
		slog.Info("Price increase detected!", "product", productName, "old", oldPrice, "new", newPrice)

		if err := s.updateTrackedItemPrice(id, newPriceText); err != nil {
			slog.Error("Failed to update tracked item price", "id", id, "error", err)
		}
	} else {
		slog.Info("No price drop", "product", productName, "old", oldPrice, "new", newPrice)
	}
}

func (s *Scheduler) sendNotification(userID, productName, oldPrice, newPrice, productID string) error {
	title := "Price Drop Alert!"
	message := fmt.Sprintf("Good news! The price for '%s' dropped from %s to %s.", productName, oldPrice, newPrice)

	_, err := s.db.Exec(`
		INSERT INTO notifications (user_id, title, message, type, product_id, old_price, new_price, is_read)
		VALUES ($1, $2, $3, 'price_drop', $4, $5, $6, false)
	`, userID, title, message, productID, oldPrice, newPrice)

	return err
}

func (s *Scheduler) updateTrackedItemPrice(itemID, newPrice string) error {
	_, err := s.db.Exec(`
		UPDATE tracked_items 
		SET price_text = $1 
		WHERE id = $2
	`, newPrice, itemID)

	return err
}

func parsePrice(priceStr string) (float64, error) {
	re := regexp.MustCompile(`[^\d\.]`)
	cleaned := re.ReplaceAllString(priceStr, "")

	return strconv.ParseFloat(cleaned, 64)
}
