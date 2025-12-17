package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
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

func enableCORS(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
}

func itemsHandler(w http.ResponseWriter, r *http.Request) {
	enableCORS(&w)
	if r.Method == "OPTIONS" {
		return
	}

	switch r.Method {
	case "GET":
		store.RLock()
		defer store.RUnlock()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(store.Items)

	case "POST":
		var item TrackedItem
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		store.Lock()
		store.Items = append(store.Items, item)
		store.Unlock()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(item)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func main() {
	http.HandleFunc("/items", itemsHandler)

	port := ":8080"
	fmt.Printf("Server starting on port %s...\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal(err)
	}
}