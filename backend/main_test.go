package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestItemsHandler(t *testing.T) {
	// Reset store
	store.Items = []TrackedItem{}

	// Test GET empty
	req, err := http.NewRequest("GET", "/items", nil)
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(itemsHandler)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusOK)
	}

	var items []TrackedItem
	if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Errorf("expected empty list, got %d items", len(items))
	}

	// Test POST
	newItem := TrackedItem{
		ID:          "123",
		ProductName: "Test Product",
		PriceText:   "$10.00",
	}
	body, _ := json.Marshal(newItem)
	req, err = http.NewRequest("POST", "/items", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusCreated {
		t.Errorf("handler returned wrong status code: got %v want %v",
			status, http.StatusCreated)
	}

	// Test GET after POST
	req, err = http.NewRequest("GET", "/items", nil)
	if err != nil {
		t.Fatal(err)
	}
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if err := json.NewDecoder(rr.Body).Decode(&items); err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Errorf("expected 1 item, got %d items", len(items))
	}
	if items[0].ProductName != "Test Product" {
		t.Errorf("expected product name 'Test Product', got %v", items[0].ProductName)
	}
}
