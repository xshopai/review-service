#!/bin/bash

# Review Service - Run with direct RabbitMQ (local development)

echo "Starting Review Service (Direct RabbitMQ)..."
echo "Service will be available at: http://localhost:8010"
echo ""

# Kill any process using port 8010 (prevents "address already in use" errors)
PORT=8010
for pid in $(netstat -ano 2>/dev/null | grep ":$PORT" | grep LISTENING | awk '{print $5}' | sort -u); do
    echo "Killing process $pid on port $PORT..."
    taskkill //F //PID $pid 2>/dev/null
done

# Copy .env.http to .env for local development (HTTP mode, no Dapr)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"
if [ -f "$SERVICE_DIR/.env.http" ]; then
    cp "$SERVICE_DIR/.env.http" "$SERVICE_DIR/.env"
    echo "✅ Copied .env.http → .env"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run in development mode with hot reload
npm run dev
