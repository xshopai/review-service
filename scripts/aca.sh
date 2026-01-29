#!/bin/bash

# ============================================================================
# Azure Container Apps Deployment Script for Review Service
# ============================================================================
# This script deploys the Review Service to Azure Container Apps.
# 
# PREREQUISITE: Run the infrastructure deployment script first:
#   cd infrastructure/azure/aca/scripts
#   ./deploy-infra.sh
#
# The infrastructure script creates all shared resources:
#   - Resource Group, ACR, Container Apps Environment
#   - Service Bus, Redis, Cosmos DB, Key Vault
#   - Dapr components (pubsub, statestore, secretstore)
# ============================================================================

set -e

# -----------------------------------------------------------------------------
# Colors for output
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Print functions
print_header() {
    echo -e "\n${BLUE}==============================================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}==============================================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

# ============================================================================
# Prerequisites Check
# ============================================================================
print_header "Checking Prerequisites"

# Check Azure CLI
if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed. Please install it from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi
print_success "Azure CLI is installed"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi
print_success "Docker is installed"

# Check if logged into Azure
if ! az account show &> /dev/null; then
    print_warning "Not logged into Azure. Initiating login..."
    az login
fi
print_success "Logged into Azure"

# ============================================================================
# Configuration
# ============================================================================
print_header "Configuration"

# Service-specific configuration (per PORT_CONFIGURATION.md: review-service = 8010)
SERVICE_NAME="review-service"
SERVICE_VERSION="1.0.0"
APP_PORT=8010
PROJECT_NAME="xshopai"

# Dapr configuration for Azure Container Apps
# In ACA, Dapr sidecar ALWAYS runs on port 3500 (HTTP) and 50001 (gRPC)
# (different from local dev where each service has unique ports per PORT_CONFIGURATION.md)
DAPR_HTTP_PORT=3500
DAPR_GRPC_PORT=50001
DAPR_PUBSUB_NAME="pubsub"

# Get script directory and service directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "$SCRIPT_DIR")"

# ============================================================================
# Environment Selection
# ============================================================================
echo -e "${CYAN}Available Environments:${NC}"
echo "   dev     - Development environment"
echo "   prod    - Production environment"
echo ""

read -p "Enter environment (dev/prod) [dev]: " ENVIRONMENT
ENVIRONMENT="${ENVIRONMENT:-dev}"

if [[ ! "$ENVIRONMENT" =~ ^(dev|prod)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT"
    echo "   Valid values: dev, prod"
    exit 1
fi
print_success "Environment: $ENVIRONMENT"

# Set environment-specific variables
case "$ENVIRONMENT" in
    dev)
        NODE_ENV="development"
        LOG_LEVEL="debug"
        ;;
    prod)
        NODE_ENV="production"
        LOG_LEVEL="warn"
        ;;
esac

# ============================================================================
# Suffix Configuration
# ============================================================================
print_header "Infrastructure Configuration"

echo -e "${CYAN}The suffix was set during infrastructure deployment.${NC}"
echo "You can find it by running:"
echo -e "   ${BLUE}az group list --query \"[?starts_with(name, 'rg-xshopai-$ENVIRONMENT')].{Name:name, Suffix:tags.suffix}\" -o table${NC}"
echo ""

read -p "Enter the infrastructure suffix: " SUFFIX

if [ -z "$SUFFIX" ]; then
    print_error "Suffix is required. Please run the infrastructure deployment first."
    exit 1
fi

# Validate suffix format
if [[ ! "$SUFFIX" =~ ^[a-z0-9]{3,6}$ ]]; then
    print_error "Invalid suffix format: $SUFFIX"
    echo "   Suffix must be 3-6 lowercase alphanumeric characters."
    exit 1
fi
print_success "Using suffix: $SUFFIX"

# ============================================================================
# Derive Resource Names from Infrastructure
# ============================================================================
# These names must match what was created by deploy-infra.sh
RESOURCE_GROUP="rg-${PROJECT_NAME}-${ENVIRONMENT}-${SUFFIX}"
ACR_NAME="${PROJECT_NAME}${ENVIRONMENT}${SUFFIX}"
CONTAINER_ENV="cae-${PROJECT_NAME}-${ENVIRONMENT}-${SUFFIX}"
KEY_VAULT="kv-${PROJECT_NAME}-${ENVIRONMENT}-${SUFFIX}"
MANAGED_IDENTITY="id-${PROJECT_NAME}-${ENVIRONMENT}-${SUFFIX}"
COSMOS_ACCOUNT="cosmos-${PROJECT_NAME}-${ENVIRONMENT}-${SUFFIX}"

# Container App name follows convention: ca-{service}-{env}-{suffix}
CONTAINER_APP_NAME="ca-${SERVICE_NAME}-${ENVIRONMENT}-${SUFFIX}"

print_info "Derived resource names:"
echo "   Resource Group:      $RESOURCE_GROUP"
echo "   Container Registry:  $ACR_NAME"
echo "   Container Env:       $CONTAINER_ENV"
echo "   Container App:       $CONTAINER_APP_NAME"
echo "   Cosmos DB:           $COSMOS_ACCOUNT"
echo ""

# ============================================================================
# Verify Infrastructure Exists
# ============================================================================
print_header "Verifying Infrastructure"

# Check Resource Group
if ! az group show --name "$RESOURCE_GROUP" &> /dev/null; then
    print_error "Resource group '$RESOURCE_GROUP' does not exist."
    echo ""
    echo "Please run the infrastructure deployment first:"
    echo -e "   ${BLUE}cd infrastructure/azure/aca/scripts${NC}"
    echo -e "   ${BLUE}./deploy-infra.sh${NC}"
    exit 1
fi
print_success "Resource Group exists: $RESOURCE_GROUP"

# Check ACR
if ! az acr show --name "$ACR_NAME" &> /dev/null; then
    print_error "Container Registry '$ACR_NAME' does not exist."
    exit 1
fi
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
print_success "Container Registry exists: $ACR_LOGIN_SERVER"

# Check Container Apps Environment
if ! az containerapp env show --name "$CONTAINER_ENV" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    print_error "Container Apps Environment '$CONTAINER_ENV' does not exist."
    exit 1
fi
print_success "Container Apps Environment exists: $CONTAINER_ENV"

# Get Managed Identity ID
IDENTITY_ID=$(MSYS_NO_PATHCONV=1 az identity show --name "$MANAGED_IDENTITY" --resource-group "$RESOURCE_GROUP" --query id -o tsv 2>/dev/null || echo "")
if [ -z "$IDENTITY_ID" ]; then
    print_warning "Managed Identity not found, will deploy without it"
else
    print_success "Managed Identity exists: $MANAGED_IDENTITY"
fi

# ============================================================================
# Get Database Connection String from Key Vault
# ============================================================================
print_header "Database Configuration"

print_info "Retrieving Cosmos DB connection string from Key Vault..."
MONGODB_URI=$(az keyvault secret show --vault-name "$KEY_VAULT" --name "xshopai-cosmos-account-connection" --query value -o tsv 2>/dev/null || echo "")

if [ -z "$MONGODB_URI" ]; then
    print_warning "Cosmos DB connection string not found in Key Vault, retrieving directly..."
    MONGODB_URI=$(az cosmosdb keys list \
        --name "$COSMOS_ACCOUNT" \
        --resource-group "$RESOURCE_GROUP" \
        --type connection-strings \
        --query "connectionStrings[0].connectionString" -o tsv)
fi

if [ -z "$MONGODB_URI" ]; then
    print_error "Could not retrieve Cosmos DB connection string"
    exit 1
fi
print_success "Database connection string retrieved"

# ============================================================================
# Confirmation
# ============================================================================
print_header "Deployment Configuration Summary"

echo -e "${CYAN}Environment:${NC}          $ENVIRONMENT"
echo -e "${CYAN}Suffix:${NC}               $SUFFIX"
echo -e "${CYAN}Resource Group:${NC}       $RESOURCE_GROUP"
echo -e "${CYAN}Container Registry:${NC}   $ACR_LOGIN_SERVER"
echo -e "${CYAN}Container Env:${NC}        $CONTAINER_ENV"
echo ""
echo -e "${CYAN}Service Configuration:${NC}"
echo -e "   Service Name:      $SERVICE_NAME"
echo -e "   Service Version:   $SERVICE_VERSION"
echo -e "   App Port:          $APP_PORT"
echo -e "   NODE_ENV:          $NODE_ENV"
echo -e "   LOG_LEVEL:         $LOG_LEVEL"
echo -e "   Dapr HTTP Port:    $DAPR_HTTP_PORT"
echo -e "   Dapr gRPC Port:    $DAPR_GRPC_PORT"
echo ""

read -p "Do you want to proceed with deployment? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    print_warning "Deployment cancelled by user"
    exit 0
fi

# ============================================================================
# Step 1: Build and Push Container Image
# ============================================================================
print_header "Step 1: Building and Pushing Container Image"

# Login to ACR
print_info "Logging into ACR..."
az acr login --name "$ACR_NAME"
print_success "Logged into ACR"

# Navigate to service directory
cd "$SERVICE_DIR"

# Build Docker image
print_info "Building Docker image..."
docker build -t "$SERVICE_NAME:latest" .
print_success "Docker image built"

# Tag and push
IMAGE_TAG="$ACR_LOGIN_SERVER/$SERVICE_NAME:latest"
docker tag "$SERVICE_NAME:latest" "$IMAGE_TAG"
print_info "Pushing image to ACR..."
docker push "$IMAGE_TAG"
print_success "Image pushed: $IMAGE_TAG"

# ============================================================================
# Step 2: Deploy Container App
# ============================================================================
print_header "Step 2: Deploying Container App"

# Get ACR credentials
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

# Check if container app exists
if az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" &> /dev/null; then
    print_info "Container app '$CONTAINER_APP_NAME' exists, updating..."
    az containerapp update \
        --name "$CONTAINER_APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --image "$IMAGE_TAG" \
        --set-env-vars \
            "NODE_ENV=$NODE_ENV" \
            "NAME=$SERVICE_NAME" \
            "VERSION=$SERVICE_VERSION" \
            "PORT=$APP_PORT" \
            "HOST=0.0.0.0" \
            "LOG_LEVEL=$LOG_LEVEL" \
            "DAPR_HTTP_PORT=$DAPR_HTTP_PORT" \
            "DAPR_GRPC_PORT=$DAPR_GRPC_PORT" \
            "DAPR_APP_ID=$SERVICE_NAME" \
            "PUBSUB_NAME=xshopai-pubsub" \
        --output none
    print_success "Container app updated"
else
    print_info "Creating container app '$CONTAINER_APP_NAME'..."
    
    MSYS_NO_PATHCONV=1 az containerapp create \
        --name "$CONTAINER_APP_NAME" \
        --container-name "$SERVICE_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --environment "$CONTAINER_ENV" \
        --image "$IMAGE_TAG" \
        --registry-server "$ACR_LOGIN_SERVER" \
        --registry-username "$ACR_NAME" \
        --registry-password "$ACR_PASSWORD" \
        --target-port $APP_PORT \
        --ingress external \
        --min-replicas 1 \
        --max-replicas 10 \
        --cpu 0.5 \
        --memory 1.0Gi \
        --enable-dapr \
        --dapr-app-id "$SERVICE_NAME" \
        --dapr-app-port $APP_PORT \
        --secrets "mongodb-uri=$MONGODB_URI" \
        --env-vars \
            "NODE_ENV=$NODE_ENV" \
            "NAME=$SERVICE_NAME" \
            "VERSION=$SERVICE_VERSION" \
            "PORT=$APP_PORT" \
            "HOST=0.0.0.0" \
            "LOG_LEVEL=$LOG_LEVEL" \
            "DAPR_HTTP_PORT=$DAPR_HTTP_PORT" \
            "DAPR_GRPC_PORT=$DAPR_GRPC_PORT" \
            "DAPR_APP_ID=$SERVICE_NAME" \
            "PUBSUB_NAME=xshopai-pubsub" \
            "MONGODB_URI=secretref:mongodb-uri" \
            "MONGODB_DB_NAME=review_service_db" \
        ${IDENTITY_ID:+--user-assigned "$IDENTITY_ID"} \
        --output none
    
    print_success "Container app created"
fi

# ============================================================================
# Step 3: Verify Deployment
# ============================================================================
print_header "Step 3: Verifying Deployment"

# For internal ingress, we can't directly access the app, so just check it exists
APP_INFO=$(az containerapp show --name "$CONTAINER_APP_NAME" --resource-group "$RESOURCE_GROUP" --query "{fqdn:properties.configuration.ingress.fqdn,status:properties.runningStatus}" -o json)
print_success "Container app deployed"
echo "$APP_INFO"

# ============================================================================
# Summary
# ============================================================================
print_header "Deployment Summary"

echo -e "${GREEN}==============================================================================${NC}"
echo -e "${GREEN}   ✅ $SERVICE_NAME DEPLOYED SUCCESSFULLY${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo -e "${CYAN}Infrastructure:${NC}"
echo "   Resource Group:   $RESOURCE_GROUP"
echo "   Environment:      $CONTAINER_ENV"
echo "   Registry:         $ACR_LOGIN_SERVER"
echo ""
echo -e "${CYAN}Service Details:${NC}"
echo "   Dapr App ID:      $SERVICE_NAME"
echo "   Ingress:          external (publicly accessible)"
echo "   Database:         review_service_db (Cosmos DB MongoDB API)"
echo ""
echo -e "${CYAN}Useful Commands:${NC}"
echo -e "   View logs:        ${BLUE}az containerapp logs show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --follow${NC}"
echo -e "   View Dapr logs:   ${BLUE}az containerapp logs show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --container daprd --follow${NC}"
echo -e "   Delete app:       ${BLUE}az containerapp delete --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --yes${NC}"
echo ""
