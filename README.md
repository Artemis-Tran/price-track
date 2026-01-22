# PriceTrack

PriceTrack is a browser extension that allows you to track the prices of items on any website. Select an element on a page, and PriceTrack will periodically check for changes and notify you of any price drops.

## Features

- **Element Picker:** A user-friendly picker to select the exact price element on a product page.
- **Backend Price Checking:** A Go backend periodically scrapes the tracked items and checks for price changes.
- **Price Drop Notifications:** The extension provides notifications when a tracked item's price has dropped.
- **User Authentication:** Secure user authentication using Supabase.
- **Tracked Items Dashboard:** A popup dashboard to view and manage all your tracked items.

## Architecture

The project is a monorepo consisting of two main parts:

- **`frontend`**: A Chrome browser extension built with TypeScript and bundled with esbuild. It handles the user interface, element picking, and communication with the backend.
- **`backend`**: A Go application that provides a REST API for managing tracked items, users, and notifications. It uses a PostgreSQL database for storage and `goquery` for web scraping. A scheduler runs in the background to periodically check for price updates.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Go](https://go.dev/) (v1.21 or higher)
- [PostgreSQL](https://www.postgresql.org/)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/price-track.git
    cd price-track
    ```

2.  **Backend Setup:**
    - Navigate to the `backend` directory: `cd backend`
    - Install Go dependencies: `go mod tidy`
    - Create a `.env` file and add the following environment variables:
      ```
      DATABASE_URL=...
      SUPABASE_JWT_SECRET=...
      ```
    - Run database migrations: `go run cmd/migrate/main.go`
    - Start the backend server: `go run main.go`

3.  **Frontend Setup:**
    - Navigate to the `frontend` directory: `cd ../frontend`
    - Install Node.js dependencies: `npm install`
    - Create a `.env` file with your Supabase credentials:
      ```
      SUPABASE_URL=...
      SUPABASE_ANON_KEY=...
      API_BASE_URL=http://localhost:8081
      ```
    - Build the extension for development: `npm run dev`

4.  **Load the extension in Chrome:**
    - Open Chrome and navigate to `chrome://extensions`
    - Enable "Developer mode"
    - Click "Load unpacked" and select the `dist` directory inside the `frontend` folder.

## Usage

1.  Open the extension popup by clicking the PriceTrack icon in your browser toolbar.
2.  Sign up or sign in to your account.
3.  Navigate to a product page you want to track.
4.  Click the "Select Price" button in the extension popup.
5.  The page will enter "picker mode". Click on the element containing the price you want to track.
6.  The item will be added to your tracked items list.
7.  The backend will now periodically check for price changes and you will be notified of any drops.

## Building for Production

To create a production-ready build of the extension, run the following command in the `frontend` directory:

```bash
npm run build
```

Note you will need to set the `API_BASE_URL` environment variable to the URL of your backend server. This is required for production builds.

This will create an optimized build in the `dist` directory, which can then be packaged and distributed or uploaded to the Chrome Web Store.
