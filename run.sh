#!/bin/bash
# Run Review Service with Dapr sidecar
# Usage: ./run.sh

echo "Starting Review Service with Dapr..."
echo "Service will be available at: http://localhost:8010"
echo "Dapr HTTP endpoint: http://localhost:3500"
echo "Dapr gRPC endpoint: localhost:50001"
echo ""

dapr run \
  --app-id review-service \
  --app-port 8010 \
  --dapr-http-port 3500 \
  --dapr-grpc-port 50001 \
  --resources-path .dapr/components \
  --config .dapr/config.yaml \
  --log-level warn \
  -- nodemon src/server.js
