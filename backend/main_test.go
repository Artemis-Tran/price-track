package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

// mockDB creates a mock database context for testing
func setupTestContext(userID string) context.Context {
	return context.WithValue(context.Background(), userIDKey, userID)
}

func TestNotificationsHandler_Unauthorized(t *testing.T) {
	req := httptest.NewRequest("GET", "/notifications", nil)
	w := httptest.NewRecorder()

	// Call without context (no userID)
	notificationsHandler(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}
}

func TestNotificationsHandler_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("POST", "/notifications", nil)
	req = req.WithContext(setupTestContext("test-user-id"))
	w := httptest.NewRecorder()

	notificationsHandler(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status %d, got %d", http.StatusMethodNotAllowed, w.Code)
	}
}

func TestMarkNotificationReadHandler_Unauthorized(t *testing.T) {
	req := httptest.NewRequest("PATCH", "/notifications/123/read", nil)
	w := httptest.NewRecorder()

	// Call without context (no userID)
	markNotificationReadHandler(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}
}

func TestMarkNotificationReadHandler_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest("GET", "/notifications/123/read", nil)
	req = req.WithContext(setupTestContext("test-user-id"))
	w := httptest.NewRecorder()

	markNotificationReadHandler(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status %d, got %d", http.StatusMethodNotAllowed, w.Code)
	}
}

// Integration tests require database - skip if not available
func TestNotificationsHandler_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Check if DATABASE_URL is set
	connStr := "postgresql://test:test@localhost:5432/testdb?sslmode=disable"
	testDB, err := sql.Open("postgres", connStr)
	if err != nil {
		t.Skip("Skipping integration test: no database connection")
	}
	defer testDB.Close()

	if err := testDB.Ping(); err != nil {
		t.Skip("Skipping integration test: database not responding")
	}

	// Set global db for handler
	db = testDB

	// Create test notification
	userID := "test-user-" + time.Now().Format("20060102150405")
	_, err = db.Exec(`
		INSERT INTO notifications (user_id, title, message, type, product_id)
		VALUES ($1, 'Test Notification', 'Test message', 'price_drop', 'product-123')
	`, userID)
	if err != nil {
		t.Fatalf("Failed to insert test notification: %v", err)
	}

	// Clean up after test
	defer func() {
		db.Exec("DELETE FROM notifications WHERE user_id = $1", userID)
	}()

	// Test GET notifications
	req := httptest.NewRequest("GET", "/notifications", nil)
	req = req.WithContext(setupTestContext(userID))
	w := httptest.NewRecorder()

	notificationsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, w.Code)
	}

	var notifications []Notification
	if err := json.NewDecoder(w.Body).Decode(&notifications); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(notifications) == 0 {
		t.Error("Expected at least one notification")
	}

	if notifications[0].Title != "Test Notification" {
		t.Errorf("Expected title 'Test Notification', got '%s'", notifications[0].Title)
	}
}
