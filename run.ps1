#!/usr/bin/env pwsh
# Run Review Service with Dapr sidecar
# Usage: .\run.ps1

$Host.UI.RawUI.WindowTitle = "Review Service"

Write-Host "Starting Review Service with Dapr..." -ForegroundColor Green
Write-Host "Service will be available at: http://localhost:8010" -ForegroundColor Cyan
Write-Host "Dapr HTTP endpoint: http://localhost:3510" -ForegroundColor Cyan
Write-Host "Dapr gRPC endpoint: localhost:50010" -ForegroundColor Cyan
Write-Host ""

dapr run `
  --app-id review-service `
  --app-port 8010 `
  --dapr-http-port 3510 `
  --dapr-grpc-port 50010 `
  --resources-path .dapr/components `
  --config .dapr/config.yaml `
  --log-level warn `
  -- nodemon src/server.js
