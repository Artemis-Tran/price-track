package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"sync"
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
	UserNotes        string `json:"userNotes"`
	SavedAtISO       string `json:"savedAtIso"`
}

type Store struct {
	sync.RWMutex
	Items []TrackedItem
}

var store = Store{
	Items: []TrackedItem{},
}

// Middleware definition
type Middleware func(http.HandlerFunc) http.HandlerFunc

// Chain applies middlewares to a http.HandlerFunc
func Chain(f http.HandlerFunc, middlewares ...Middleware) http.HandlerFunc {
	for _, m := range middlewares {
		f = m(f)
	}
	return f
}

// CORSMiddleware handles Cross-Origin Resource Sharing
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
		store.RLock()
		defer store.RUnlock()

		slog.Info("Returning items", "count", len(store.Items))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(store.Items)

	case "POST":
		var item TrackedItem
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			slog.Error("Failed to decode item", "error", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		store.Lock()
		store.Items = append(store.Items, item)
		store.Unlock()

		slog.Info("Received item", "id", item.ID, "productName", item.ProductName)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(item)

	case "DELETE":
		store.Lock()
		store.Items = []TrackedItem{}
		store.Unlock()

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
		store.Lock()
		defer store.Unlock()

		for i, item := range store.Items {
			if item.ID == id {
				store.Items = append(store.Items[:i], store.Items[i+1:]...)
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}

		slog.Warn("Item not found", "id", id)
		http.Error(w, "Item not found", http.StatusNotFound)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	http.HandleFunc("/items", Chain(itemsHandler, LoggingMiddleware, CORSMiddleware))
	http.HandleFunc("/items/{id}", Chain(itemHandler, LoggingMiddleware, CORSMiddleware))

	port := ":8080"
	slog.Info("Server starting", "port", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}
