#!/bin/bash
# Azure Container Apps Deployment Script for Review Service (Node.js)
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
print_header() { echo -e "\n${BLUE}============================================================================${NC}\n${BLUE}$1${NC}\n${BLUE}============================================================================${NC}\n"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }

prompt_with_default() { local prompt="$1" default="$2" varname="$3"; read -p "$prompt [$default]: " input; eval "$varname=\"${input:-$default}\""; }

print_header "Checking Prerequisites"
command -v az &> /dev/null || { echo "Azure CLI not installed"; exit 1; }
command -v docker &> /dev/null || { echo "Docker not installed"; exit 1; }
az account show &> /dev/null || az login
print_success "Prerequisites verified"

print_header "Azure Configuration"
prompt_with_default "Enter Resource Group name" "rg-xshopai-aca" RESOURCE_GROUP
prompt_with_default "Enter Azure Location" "swedencentral" LOCATION
prompt_with_default "Enter Azure Container Registry name" "acrxshopaiaca" ACR_NAME
prompt_with_default "Enter Container Apps Environment name" "cae-xshopai-aca" ENVIRONMENT_NAME
prompt_with_default "Enter Cosmos DB Account name" "cosmos-xshopai-aca" COSMOS_ACCOUNT
prompt_with_default "Enter Redis Cache name" "redis-xshopai-aca" REDIS_NAME

APP_NAME="review-service"
APP_PORT=9001

read -p "Proceed with deployment? (y/N): " CONFIRM
[[ ! "$CONFIRM" =~ ^[Yy]$ ]] && exit 0

print_header "Setting Up Cosmos DB (MongoDB)"
if ! az cosmosdb show --name "$COSMOS_ACCOUNT" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    az cosmosdb create \
        --name "$COSMOS_ACCOUNT" \
        --resource-group "$RESOURCE_GROUP" \
        --kind MongoDB \
        --server-version "4.2" \
        --output none
fi

az cosmosdb mongodb database create \
    --account-name "$COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --name "review-service-db" \
    --output none 2>/dev/null || true

MONGODB_URI=$(az cosmosdb keys list \
    --name "$COSMOS_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --type connection-strings \
    --query "connectionStrings[0].connectionString" -o tsv)

print_header "Setting Up Redis Cache"
if ! az redis show --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    az redis create \
        --name "$REDIS_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --sku Basic \
        --vm-size c0 \
        --output none
fi

REDIS_HOST="${REDIS_NAME}.redis.cache.windows.net"
REDIS_KEY=$(az redis list-keys --name "$REDIS_NAME" --resource-group "$RESOURCE_GROUP" --query primaryKey -o tsv)
REDIS_URL="rediss://:${REDIS_KEY}@${REDIS_HOST}:6380"

print_header "Building and Deploying"
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
az acr login --name "$ACR_NAME"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(dirname "$SCRIPT_DIR")"

IMAGE_TAG="${ACR_LOGIN_SERVER}/${APP_NAME}:latest"
docker build -t "$IMAGE_TAG" .
docker push "$IMAGE_TAG"

az containerapp env show --name "$ENVIRONMENT_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null || \
    az containerapp env create --name "$ENVIRONMENT_NAME" --resource-group "$RESOURCE_GROUP" --location "$LOCATION" --output none

if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    az containerapp update --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --image "$IMAGE_TAG" --output none
else
    az containerapp create \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --environment "$ENVIRONMENT_NAME" \
        --image "$IMAGE_TAG" \
        --registry-server "$ACR_LOGIN_SERVER" \
        --target-port $APP_PORT \
        --ingress internal \
        --min-replicas 1 \
        --max-replicas 5 \
        --cpu 0.5 \
        --memory 1Gi \
        --enable-dapr \
        --dapr-app-id "$APP_NAME" \
        --dapr-app-port $APP_PORT \
        --secrets "mongodb-uri=${MONGODB_URI}" "redis-url=${REDIS_URL}" \
        --env-vars \
            "NODE_ENV=production" \
            "PORT=$APP_PORT" \
            "MONGODB_URI=secretref:mongodb-uri" \
            "MONGODB_DB_NAME=review-service-db" \
            "REDIS_URL=secretref:redis-url" \
            "DAPR_HTTP_PORT=3510" \
            "PUBSUB_NAME=xshopai-pubsub" \
        --output none
fi

print_header "Deployment Complete!"
echo -e "${GREEN}Review Service deployed!${NC} Dapr App ID: $APP_NAME"
