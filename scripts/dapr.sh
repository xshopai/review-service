#!/bin/bash

# Review Service - Run with Dapr Pub/Sub

echo "Starting Review Service (Dapr Pub/Sub)..."
echo "Service will be available at: http://localhost:8010"
echo "Dapr HTTP endpoint: http://localhost:3510"
echo "Dapr gRPC endpoint: localhost:50010"
echo ""

# Kill any processes using required ports (prevents "address already in use" errors)
for PORT in 8010 3510 50010; do
    for pid in $(netstat -ano 2>/dev/null | grep ":$PORT" | grep LISTENING | awk '{print $5}' | sort -u); do
        echo "Killing process $pid on port $PORT..."
        taskkill //F //PID $pid 2>/dev/null
    done
done

dapr run \
  --app-id review-service \
  --app-port 8010 \
  --dapr-http-port 3510 \
  --dapr-grpc-port 50010 \
  --log-level info \
  --config ./.dapr/config.yaml \
  --resources-path ./.dapr/components \
  -- node src/server.js

