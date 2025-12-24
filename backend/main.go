package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
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

type contextKey string

const userIDKey contextKey = "userID"

func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "Invalid Authorization header format", http.StatusUnauthorized)
			return
		}
		tokenString := parts[1]

		secret := os.Getenv("SUPABASE_JWT_SECRET")
		if secret == "" {
			slog.Error("SUPABASE_JWT_SECRET is not set")
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(secret), nil
		})

		if err != nil || !token.Valid {
			slog.Warn("Invalid token", "error", err)
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			http.Error(w, "Invalid token claims", http.StatusUnauthorized)
			return
		}

		sub, ok := claims["sub"].(string)
		if !ok || sub == "" {
			http.Error(w, "Token missing sub claim", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), userIDKey, sub)
		next(w, r.WithContext(ctx))
	}
}

func itemsHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(string)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case "GET":
		rows, err := db.Query(`
			SELECT id, price_text, product_name, image_url, css_selector, xpath, page_url, outer_html_snippet, captured_at, saved_at 
			FROM tracked_items 
			WHERE user_id = $1
			ORDER BY created_at DESC
		`, userID)
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

		slog.Info("Returning items", "count", len(items), "user_id", userID)
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
			INSERT INTO tracked_items (id, price_text, product_name, image_url, css_selector, xpath, page_url, outer_html_snippet, captured_at, saved_at, user_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		`, item.ID, item.PriceText, item.ProductName, item.ImageURL, item.CSSSelector, item.XPath, item.PageURL, item.OuterHTMLSnippet, capturedAt, savedAt, userID)

		if err != nil {
			slog.Error("Failed to insert item", "error", err)
			http.Error(w, "Failed to save item", http.StatusInternalServerError)
			return
		}

		slog.Info("Received and saved item", "id", item.ID, "productName", item.ProductName, "user_id", userID)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(item)

	case "DELETE":
		_, err := db.Exec("DELETE FROM tracked_items WHERE user_id = $1", userID)
		if err != nil {
			slog.Error("Failed to delete all items", "error", err)
			http.Error(w, "Failed to delete items", http.StatusInternalServerError)
			return
		}

		slog.Info("Cleared all items", "user_id", userID)
		w.WriteHeader(http.StatusNoContent)

	default:
		slog.Warn("Method not allowed", "method", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func itemHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(string)
	if !ok {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")

	if r.Method == "DELETE" {
		result, err := db.Exec("DELETE FROM tracked_items WHERE id = $1 AND user_id = $2", id, userID)
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

	// Load .env file
	if err := godotenv.Load(); err != nil {
		slog.Warn("No .env file found, relying on system environment variables")
	}

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

	// Update chain to include AuthMiddleware
	http.HandleFunc("/items", Chain(itemsHandler, AuthMiddleware, LoggingMiddleware, CORSMiddleware))
	http.HandleFunc("/items/{id}", Chain(itemHandler, AuthMiddleware, LoggingMiddleware, CORSMiddleware))

	port := ":8080"
	slog.Info("Server starting", "port", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}
