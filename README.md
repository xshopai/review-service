# ⭐ Review Service

Product review and rating microservice for xShop.ai - manages customer reviews, ratings, moderation, helpfulness voting, and real-time analytics.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **MongoDB** 8+ ([Download](https://www.mongodb.com/try/download/community))
- **Redis** 7+ ([Install Guide](https://redis.io/docs/getting-started/))
- **RabbitMQ** ([Install Guide](https://www.rabbitmq.com/download.html))
- **Dapr CLI** 1.16+ ([Install Guide](https://docs.dapr.io/getting-started/install-dapr-cli/))

### Setup

**1. Start Dependencies**
```bash
# Using Docker (recommended)
docker run -d --name review-mongodb -p 27020:27017 mongo:8
docker run -d --name review-redis -p 6379:6379 redis:7-alpine

# Or install MongoDB and Redis locally
```

**2. Clone & Install**
```bash
git clone https://github.com/xshopai/review-service.git
cd review-service
npm install
```

**3. Configure Environment**
```bash
# Copy environment template
cp .env.example .env

# Edit .env - update these values:
# MONGODB_URI=mongodb://admin:admin123@localhost:27020/aioutlet_reviews?authSource=admin
# REDIS_URL=redis://localhost:6379
# RABBITMQ_URL=amqp://localhost:5672
```

**4. Initialize Dapr**
```bash
# First time only
dapr init
```

**5. Run Service**
```bash
# Start with Dapr (recommended)
npm run dev

# Or use platform-specific scripts
./run.sh       # Linux/Mac
.\run.ps1      # Windows
```

**6. Verify**
```bash
# Check health
curl http://localhost:9001/health

# Should return: {"status":"UP","service":"review-service"...}
```

### Common Commands

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Lint code
npm run lint

# Production mode
npm start
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [📖 Developer Guide](docs/DEVELOPER_GUIDE.md) | Local setup, debugging, daily workflows |
| [📘 Technical Reference](docs/TECHNICAL.md) | Architecture, security, monitoring |
| [🤝 Contributing](docs/CONTRIBUTING.md) | Contribution guidelines and workflow |

**API Documentation**: See `src/routes/` for endpoint definitions and `tests/integration/` for API contract examples.

## ⚙️ Configuration

### Environment Variables

```bash
# Server Configuration
NODE_ENV=development
PORT=9001
HOST=0.0.0.0

# Database
# Option 1: Direct MongoDB URI (recommended)
MONGODB_URI=mongodb://admin:admin123@localhost:27020/aioutlet_reviews?authSource=admin

# Option 2: Individual variables (fallback if MONGODB_URI not set)
# MONGO_INITDB_ROOT_USERNAME=admin
# MONGO_INITDB_ROOT_PASSWORD=admin123
# MONGO_INITDB_DATABASE=aioutlet_reviews
# MONGODB_HOST=localhost
# MONGODB_PORT=27020
# MONGODB_AUTH_SOURCE=admin

REDIS_URL=redis://localhost:6379

# Message Broker
RABBITMQ_URL=amqp://localhost:5672

# Security
JWT_SECRET=your-jwt-secret
CORS_ORIGIN=http://localhost:3000

# External Services
USER_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
ORDER_SERVICE_URL=http://localhost:3003

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Dapr
DAPR_HTTP_PORT=3509              # Dapr sidecar HTTP port
DAPR_GRPC_PORT=50009             # Dapr sidecar gRPC port
```

See [.env.example](.env.example) for complete configuration options.

## ✨ Key Features

- Product rating and review system (1-5 stars)
- Automated content moderation
- Real-time analytics and aggregations
- Review helpfulness voting system
- Verified purchase validation
- Advanced filtering and sorting
- Media attachment support
- Event-driven architecture with RabbitMQ
- Redis caching for performance
- Comprehensive monitoring and health checks

## 🔗 Related Services

- [product-service](https://github.com/xshopai/product-service) - Product catalog management
- [order-service](https://github.com/xshopai/order-service) - Order verification for reviews
- [user-service](https://github.com/xshopai/user-service) - User profile management

## 📄 License

MIT License - see [LICENSE](LICENSE)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/xshopai/review-service/issues)
- **Discussions**: [GitHub Discussions](https://github.com/xshopai/review-service/discussions)
- **Documentation**: [docs/](docs/)
