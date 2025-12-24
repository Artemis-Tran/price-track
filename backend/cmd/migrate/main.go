package main

import (
	"database/sql"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		log.Fatal("DATABASE_URL environment variable is not set")
	}

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Failed to open database connection: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	migrationFile := "migrations/001_init.sql"
	if _, err := os.Stat(migrationFile); os.IsNotExist(err) {
		migrationFile = "../../migrations/001_init.sql"
	}

	// Final check
	if _, err := os.Stat(migrationFile); os.IsNotExist(err) {
		// Fallback to absolute path or just fail
		cwd, _ := os.Getwd()
		log.Fatalf("Could not find migration file '%s'. Current working directory: %s", migrationFile, cwd)
	}

	content, err := os.ReadFile(migrationFile)
	if err != nil {
		log.Fatalf("Failed to read migration file: %v", err)
	}

	log.Printf("Running migration from %s...", migrationFile)
	_, err = db.Exec(string(content))
	if err != nil {
		log.Fatalf("Migration failed: %v", err)
	}

	log.Println("Migration completed successfully!")
}
