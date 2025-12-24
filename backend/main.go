package main

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"

	_ "github.com/lib/pq"
)

type TrackedItem struct {
	ID               string `json:"id"`
	PriceText        string `json:"priceText"`
	ProductName      string `json:"productName"`
	ImageURL         string `json:"imageUrl"`
	CSSSelector      string `json:"cssSelector"`
	XPath            string `json:"xPath"`
	PageURL          string `json:"pageUrl"`
	OuterHTMLSnippet string `json:"outerHtmlSnippet"`
	CapturedAtISO    string `json:"capturedAtIso"`
	SavedAtISO       string `json:"savedAtIso"`
}

var db *sql.DB

type Middleware func(http.HandlerFunc) http.HandlerFunc

// Chain applies middlewares to a http.HandlerFunc
func Chain(f http.HandlerFunc, middlewares ...Middleware) http.HandlerFunc {
	for _, m := range middlewares {
		f = m(f)
	}
	return f
}

func CORSMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// LoggingMiddleware logs the incoming request
func LoggingMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slog.Info("Handling request", "method", r.Method, "path", r.URL.Path)
		next(w, r)
	}
}

func itemsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		rows, err := db.Query(`
			SELECT id, price_text, product_name, image_url, css_selector, xpath, page_url, outer_html_snippet, captured_at, saved_at 
			FROM tracked_items 
			ORDER BY created_at DESC
		`)
		if err != nil {
			slog.Error("Failed to query items", "error", err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		items := []TrackedItem{}
		for rows.Next() {
			var i TrackedItem
			var capturedAt, savedAt time.Time
			if err := rows.Scan(
				&i.ID, &i.PriceText, &i.ProductName, &i.ImageURL, &i.CSSSelector, &i.XPath, &i.PageURL, &i.OuterHTMLSnippet, &capturedAt, &savedAt,
			); err != nil {
				slog.Error("Failed to scan item", "error", err)
				continue
			}
			i.CapturedAtISO = capturedAt.Format(time.RFC3339)
			i.SavedAtISO = savedAt.Format(time.RFC3339)
			items = append(items, i)
		}

		slog.Info("Returning items", "count", len(items))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(items)

	case "POST":
		var item TrackedItem
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			slog.Error("Failed to decode item", "error", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		capturedAt, err := time.Parse(time.RFC3339, item.CapturedAtISO)
		if err != nil {
			slog.Error("Failed to parse capturedAtIso", "error", err)
			http.Error(w, "Invalid capturedAtIso", http.StatusBadRequest)
			return
		}
		savedAt, err := time.Parse(time.RFC3339, item.SavedAtISO)
		if err != nil {
			slog.Error("Failed to parse savedAtIso", "error", err)
			http.Error(w, "Invalid savedAtIso", http.StatusBadRequest)
			return
		}

		_, err = db.Exec(`
			INSERT INTO tracked_items (id, price_text, product_name, image_url, css_selector, xpath, page_url, outer_html_snippet, captured_at, saved_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		`, item.ID, item.PriceText, item.ProductName, item.ImageURL, item.CSSSelector, item.XPath, item.PageURL, item.OuterHTMLSnippet, capturedAt, savedAt)

		if err != nil {
			slog.Error("Failed to insert item", "error", err)
			http.Error(w, "Failed to save item", http.StatusInternalServerError)
			return
		}

		slog.Info("Received and saved item", "id", item.ID, "productName", item.ProductName)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(item)

	case "DELETE":
		_, err := db.Exec("DELETE FROM tracked_items")
		if err != nil {
			slog.Error("Failed to delete all items", "error", err)
			http.Error(w, "Failed to delete items", http.StatusInternalServerError)
			return
		}

		slog.Info("Cleared all items")
		w.WriteHeader(http.StatusNoContent)

	default:
		slog.Warn("Method not allowed", "method", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func itemHandler(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	if r.Method == "DELETE" {
		result, err := db.Exec("DELETE FROM tracked_items WHERE id = $1", id)
		if err != nil {
			slog.Error("Failed to delete item", "id", id, "error", err)
			http.Error(w, "Failed to delete item", http.StatusInternalServerError)
			return
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected == 0 {
			slog.Warn("Item not found", "id", id)
			http.Error(w, "Item not found", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		slog.Error("DATABASE_URL environment variable is not set")
		os.Exit(1)
	}

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		slog.Error("Failed to open database connection", "error", err)
		os.Exit(1)
	}

	if err := db.Ping(); err != nil {
		slog.Error("Failed to ping database", "error", err)
		os.Exit(1)
	}
	slog.Info("Connected to database")

	http.HandleFunc("/items", Chain(itemsHandler, LoggingMiddleware, CORSMiddleware))
	http.HandleFunc("/items/{id}", Chain(itemHandler, LoggingMiddleware, CORSMiddleware))

	port := ":8080"
	slog.Info("Server starting", "port", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}
