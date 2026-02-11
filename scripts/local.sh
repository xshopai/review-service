#!/bin/bash

# Review Service - Run without Dapr (local development)

echo "Starting Review Service (without Dapr)..."
echo "Service will be available at: http://localhost:8008"
echo ""
echo "Note: Event publishing will fail without Dapr but service will continue."
echo "This mode is suitable for isolated development and testing."
echo ""

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run in development mode with hot reload
npm run dev
