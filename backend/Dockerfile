# Build Stage
FROM golang:1.24-alpine AS builder

# Set working directory
WORKDIR /app

# Install git (required for fetching dependencies sometimes)
RUN apk add --no-cache git

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download all dependencies
RUN go mod download

# Copy the source code
COPY . .

# Build the application
# -o main: name the output binary "main"
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# Run Stage
# Use the official Playwright image which has all browser dependencies pre-installed.
# This prevents "missing libraries" errors.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /root/

# Copy the binary from the builder stage
COPY --from=builder /app/main .

# Expose the API port
EXPOSE 8081

# Command to run the executable
CMD ["./main"]
