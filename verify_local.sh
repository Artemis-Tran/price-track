#!/bin/bash
set -e

echo "1. Building binaries..."
cd backend
go build -o api ./main.go
go build -o scraper ./cmd/scraper/main.go

echo "2. Starting API (background)..."
# Check if .env exists, if not warn user
if [ ! -f .env ]; then
    echo "WARNING: No .env file found in backend/. Make sure you have DATABASE_URL set."
fi

./api &
API_PID=$!
echo "API running with PID $API_PID"

echo "3. Waiting for API to be ready..."
sleep 2

echo "4. Running Scraper Job..."
./scraper

echo "5. Scraper finished. Cleaning up API..."
kill $API_PID

echo "Done! If you saw 'Scraper job finished' and no errors, it works."
