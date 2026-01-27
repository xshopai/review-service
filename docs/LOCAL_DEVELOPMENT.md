# Review Service - Local Development Guide

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- MongoDB 6+ (local or Docker)
- Redis (for caching) - optional

## Quick Start

### 1. Start MongoDB

```bash
docker run -d \
  --name mongodb-review \
  -p 27019:27017 \
  mongo:6
```

### 2. Start Redis (optional)

```bash
docker run -d \
  --name redis-review \
  -p 6379:6379 \
  redis:7
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment

Create `.env` file:

```env
NODE_ENV=development
PORT=9001
HOST=0.0.0.0

# MongoDB
MONGODB_URI=mongodb://localhost:27019
MONGODB_DB_NAME=review-service-db

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Dapr
DAPR_HTTP_PORT=3500
PUBSUB_NAME=xshopai-pubsub
```

### 5. Start the Service

Without Dapr:

```bash
npm run dev
```

With Dapr:

```bash
./run.sh
```

## API Endpoints

| Method | Endpoint                           | Description         |
| ------ | ---------------------------------- | ------------------- |
| GET    | `/health`                          | Health check        |
| POST   | `/api/reviews`                     | Create review       |
| GET    | `/api/reviews/product/{productId}` | Get product reviews |
| GET    | `/api/reviews/{id}`                | Get review by ID    |
| PUT    | `/api/reviews/{id}`                | Update review       |
| DELETE | `/api/reviews/{id}`                | Delete review       |
| POST   | `/api/reviews/{id}/helpful`        | Mark as helpful     |
| POST   | `/api/reviews/{id}/report`         | Report review       |

## Review Schema

```javascript
{
  productId: String,
  userId: String,
  rating: Number (1-5),
  title: String,
  content: String,
  verifiedPurchase: Boolean,
  helpful: { count: Number, users: [String] },
  images: [String],
  createdAt: Date,
  updatedAt: Date
}
```

## Published Events

| Event            | Trigger              |
| ---------------- | -------------------- |
| `review.created` | New review submitted |
| `review.updated` | Review modified      |
| `review.deleted` | Review removed       |

## Caching Strategy

- Product review aggregates cached for 5 minutes
- Individual reviews cached for 1 minute
- Cache invalidated on write operations

## Troubleshooting

### MongoDB Connection Failed

- Verify MongoDB is running: `docker ps`
- Check connection string format

### Redis Connection Issues

- Service works without Redis (caching disabled)
- Verify Redis is running on port 6379
