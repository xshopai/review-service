# Review Service - Azure Container Apps Deployment

## Overview

This guide covers deploying the Review Service (Node.js) to Azure Container Apps (ACA) with MongoDB (Cosmos DB) and Redis for caching.

## Prerequisites

- Azure CLI installed and authenticated
- Docker installed
- Azure subscription with appropriate permissions
- Azure Container Registry (ACR) created
- Azure Cosmos DB (MongoDB API)
- Azure Redis Cache

## Quick Deployment

### Using the Deployment Script

**PowerShell (Windows):**

```powershell
cd scripts
.\aca.ps1
```

**Bash (macOS/Linux):**

```bash
cd scripts
./aca.sh
```

## Manual Deployment

### 1. Set Variables

```bash
RESOURCE_GROUP="rg-xshopai-aca"
LOCATION="swedencentral"
ACR_NAME="acrxshopaiaca"
ENVIRONMENT_NAME="cae-xshopai-aca"
COSMOS_ACCOUNT="cosmos-xshopai-aca"
REDIS_NAME="redis-xshopai-aca"
APP_NAME="review-service"
APP_PORT=9001
DATABASE_NAME="reviews_db"
```

### 2. Create Azure Resources

```bash
# Create Cosmos DB account (if not exists)
az cosmosdb create \
  --name $COSMOS_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --kind MongoDB \
  --capabilities EnableMongo \
  --default-consistency-level Session

# Create Redis Cache
az redis create \
  --name $REDIS_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Basic \
  --vm-size c0
```

### 3. Build and Push Image

```bash
az acr login --name $ACR_NAME
docker build -t $ACR_NAME.azurecr.io/$APP_NAME:latest .
docker push $ACR_NAME.azurecr.io/$APP_NAME:latest
```

### 4. Deploy Container App

```bash
COSMOS_CONN=$(az cosmosdb keys list --name $COSMOS_ACCOUNT --resource-group $RESOURCE_GROUP --type connection-strings --query "connectionStrings[0].connectionString" -o tsv)
REDIS_KEY=$(az redis list-keys --name $REDIS_NAME --resource-group $RESOURCE_GROUP --query primaryKey -o tsv)
REDIS_URL="rediss://:${REDIS_KEY}@${REDIS_NAME}.redis.cache.windows.net:6380"

az containerapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $ENVIRONMENT_NAME \
  --image $ACR_NAME.azurecr.io/$APP_NAME:latest \
  --registry-server $ACR_NAME.azurecr.io \
  --target-port $APP_PORT \
  --ingress internal \
  --min-replicas 1 \
  --max-replicas 5 \
  --cpu 0.5 \
  --memory 1Gi \
  --enable-dapr \
  --dapr-app-id $APP_NAME \
  --dapr-app-port $APP_PORT \
  --secrets \
    "cosmos-conn=$COSMOS_CONN" \
    "redis-password=$REDIS_PASSWORD" \
  --env-vars \
    "PORT=$APP_PORT" \
    "NODE_ENV=production" \
    "MONGODB_URI=secretref:cosmos-conn" \
    "MONGODB_DATABASE=$DATABASE_NAME" \
    "REDIS_PASSWORD=secretref:redis-password" \
    "LOG_LEVEL=info"
```

## Configuration

### Environment Variables

| Variable           | Description                 |
| ------------------ | --------------------------- |
| `PORT`             | HTTP server port            |
| `NODE_ENV`         | Node environment            |
| `MONGODB_URI`      | Cosmos DB connection string |
| `MONGODB_DATABASE` | Database name               |
| `REDIS_PASSWORD`   | Redis cache password        |

## API Endpoints

- `GET /api/reviews/product/{productId}` - Get reviews for product
- `POST /api/reviews` - Create review
- `PUT /api/reviews/{id}` - Update review
- `DELETE /api/reviews/{id}` - Delete review
- `GET /api/reviews/stats/{productId}` - Get review statistics

## Event Publishing

The service publishes events via Dapr pub/sub:

- `review.created` - New review submitted
- `review.updated` - Review modified
- `review.deleted` - Review removed

## Monitoring

```bash
az containerapp logs show \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --follow
```

## Troubleshooting

### MongoDB Connection Issues

1. Verify Cosmos DB connection string
2. Check firewall rules
3. Ensure MongoDB API is enabled

### Redis Cache Issues

1. Verify Redis connection URL
2. Check TLS configuration
3. Review cache metrics
