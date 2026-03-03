<div align="center">

# ⭐ Review Service

**Product review and rating management microservice for the xshopai e-commerce platform**

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.0+-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Dapr](https://img.shields.io/badge/Dapr-Enabled-0D597F?style=for-the-badge&logo=dapr&logoColor=white)](https://dapr.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

[Getting Started](#-getting-started) •
[Documentation](#-documentation) •
[API Reference](docs/PRD.md) •
[Contributing](#-contributing)

</div>

---

## 🎯 Overview

The **Review Service** manages the full lifecycle of customer product reviews — creation, moderation, helpfulness voting, and real-time analytics. Built with Node.js (ESM) and MongoDB, it validates purchases via the order-service, publishes events to RabbitMQ, and integrates with the Dapr service mesh for cross-service communication.

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### ⭐ Review Management

- Product rating and reviews (1–5 stars)
- Verified purchase validation
- Media attachment support
- Advanced filtering and sorting

</td>
<td width="50%">

### 🛡️ Moderation & Quality

- Automated content moderation
- Admin approval/rejection workflows
- Helpfulness voting system
- Content policy enforcement

</td>
</tr>
<tr>
<td width="50%">

### 📊 Analytics & Aggregation

- Real-time rating aggregations
- Review statistics per product
- Trend analysis and reporting
- Redis-cached performance

</td>
<td width="50%">

### 📡 Event-Driven Architecture

- RabbitMQ event publishing
- Dapr pub/sub integration
- Cross-service review verification
- OpenTelemetry distributed tracing

</td>
</tr>
</table>

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- MongoDB 8.0+
- Docker & Docker Compose (optional)
- Dapr CLI (for production-like setup)

### Quick Start with Docker Compose

```bash
# Clone the repository
git clone https://github.com/xshopai/review-service.git
cd review-service

# Start MongoDB + service
docker-compose up -d

# Verify the service is healthy
curl http://localhost:8010/health
```

### Local Development Setup

<details>
<summary><b>🔧 Without Dapr (Simple Setup)</b></summary>

```bash
# Install dependencies
npm install

# Start MongoDB
docker-compose -f docker-compose.db.yml up -d

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the service
npm run dev
```

📖 See [Local Development Guide](docs/LOCAL_DEVELOPMENT.md) for detailed instructions.

</details>

<details>
<summary><b>⚡ With Dapr (Production-like)</b></summary>

```bash
# Ensure Dapr is initialized
dapr init

# Start with Dapr sidecar
./run.sh       # Linux/Mac
.\run.ps1      # Windows

# Or manually
dapr run \
  --app-id review-service \
  --app-port 8010 \
  --dapr-http-port 3500 \
  --resources-path .dapr/components \
  --config .dapr/config.yaml \
  -- npm start
```

> **Note:** All services now use the standard Dapr ports (3500 for HTTP, 50001 for gRPC).

</details>

---

## 📚 Documentation

| Document                                          | Description                                        |
| :------------------------------------------------ | :------------------------------------------------- |
| 📘 [Local Development](docs/LOCAL_DEVELOPMENT.md) | Step-by-step local setup without Dapr              |
| ☁️ [Azure Container Apps](docs/ACA_DEPLOYMENT.md) | Deploy to serverless containers with built-in Dapr |

**API Documentation**: See `src/routes/` for endpoint definitions and `tests/integration/` for API contract examples.

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage
```

### Test Coverage

| Metric      | Status    |
| :---------- | :-------- |
| Unit Tests  | ✅ Jest   |
| Integration | ✅ Jest   |
| E2E Tests   | ✅ Jest   |
| Linting     | ✅ ESLint |

---

## 🏗️ Project Structure

```
review-service/
├── 📁 src/                       # Application source code
│   ├── 📁 routes/                # Express route handlers
│   ├── 📁 services/              # Business logic layer
│   ├── 📁 repositories/          # Data access layer (MongoDB)
│   ├── 📁 models/                # Mongoose models and schemas
│   ├── 📁 middleware/            # Authentication, validation
│   ├── 📁 events/                # Event publishing (RabbitMQ/Dapr)
│   └── 📁 utils/                 # Helper functions
├── 📁 tests/                     # Test suite
│   ├── 📁 unit/                  # Unit tests
│   ├── 📁 integration/           # Integration tests
│   └── 📁 e2e/                   # End-to-end tests
├── 📁 scripts/                   # Utility scripts
├── 📁 docs/                      # Documentation
├── 📁 .dapr/                     # Dapr configuration
│   ├── 📁 components/            # Pub/sub, state store configs
│   └── 📄 config.yaml            # Dapr runtime configuration
├── 📄 docker-compose.yml         # Full service stack
├── 📄 docker-compose.db.yml      # MongoDB only
├── 📄 Dockerfile                 # Production container image
└── 📄 package.json               # Dependencies and scripts
```

---

## 🔧 Technology Stack

| Category          | Technology                                 |
| :---------------- | :----------------------------------------- |
| 🟢 Runtime        | Node.js 20+ (JavaScript ESM)               |
| 🌐 Framework      | Express 4.18                               |
| 🗄️ Database       | MongoDB 8.0+ with Mongoose 7.5             |
| 📨 Messaging      | Dapr Pub/Sub (RabbitMQ) + amqplib          |
| 🔐 Authentication | JWT Tokens + Role-based access control     |
| 🧪 Testing        | Jest with unit, integration & E2E tests    |
| 📊 Observability  | OpenTelemetry + Winston structured logging |

---

## ⚡ Quick Reference

```bash
# 🐳 Docker Compose
docker-compose up -d              # Start all services
docker-compose down               # Stop all services
docker-compose -f docker-compose.db.yml up -d  # MongoDB only

# 🔧 Local Development
npm run dev                       # Start with hot reload
npm start                         # Production mode

# ⚡ Dapr Development
./run.sh                          # Linux/Mac
.\run.ps1                         # Windows

# 🧪 Testing
npm test                          # Run all tests
npm run test:coverage             # With coverage report
npm run test:watch                # Watch mode

# 🔍 Health Check
curl http://localhost:8010/health
```

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Write** tests for your changes
4. **Run** the test suite
   ```bash
   npm test && npm run lint
   ```
5. **Commit** your changes
   ```bash
   git commit -m 'feat: add amazing feature'
   ```
6. **Push** to your branch
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open** a Pull Request

Please ensure your PR:

- ✅ Passes all existing tests
- ✅ Includes tests for new functionality
- ✅ Follows the existing code style
- ✅ Updates documentation as needed

---

## 🆘 Support

| Resource         | Link                                                                        |
| :--------------- | :-------------------------------------------------------------------------- |
| 🐛 Bug Reports   | [GitHub Issues](https://github.com/xshopai/review-service/issues)           |
| 📖 Documentation | [docs/](docs/)                                                              |
| 💬 Discussions   | [GitHub Discussions](https://github.com/xshopai/review-service/discussions) |

---

## 📄 License

This project is part of the **xshopai** e-commerce platform.
Licensed under the MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**[⬆ Back to Top](#-review-service)**

Made with ❤️ by the xshopai team

</div>
