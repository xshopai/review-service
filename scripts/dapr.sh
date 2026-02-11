#!/bin/bash

# Review Service - Run with Dapr

echo "Starting Review Service with Dapr..."
echo "Service will be available at: http://localhost:8010"
echo "Dapr HTTP endpoint: http://localhost:3510"
echo "Dapr gRPC endpoint: localhost:50010"
echo ""

dapr run \
  --app-id review-service \
  --app-port 8010 \
  --dapr-http-port 3510 \
  --dapr-grpc-port 50010 \
  --log-level info \
  --config ./.dapr/config.yaml \
  --resources-path ./.dapr/components \
  -- node src/server.js

