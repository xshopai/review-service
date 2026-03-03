# Copilot Instructions — review-service

## Service Identity

- **Name**: review-service
- **Purpose**: Product review and rating management — CRUD, moderation, aggregated ratings
- **Port**: 8010
- **Language**: Node.js 20+ (JavaScript ESM)
- **Framework**: Express with Mongoose ODM
- **Database**: MongoDB 8.0+ (port 27020)
- **Dapr App ID**: `review-service`

## Architecture

- **Pattern**: Layered MVC — routes → controllers → models (Mongoose)
- **API Style**: RESTful JSON APIs
- **Authentication**: JWT Bearer tokens
- **Messaging**: Dapr pub/sub for review events
- **Event Format**: CloudEvents 1.0 specification

## Project Structure

```
review-service/
├── src/
│   ├── controllers/     # Review endpoint handlers
│   ├── models/          # Mongoose schemas (Review)
│   ├── routes/          # Route definitions
│   ├── middlewares/      # Auth, validation
│   └── core/            # Config, logger, errors
├── tests/
│   └── unit/
├── .dapr/components/
└── package.json
```

## Code Conventions

- **ESM modules** with Babel transpilation
- Mongoose schemas with validation and indexes
- Review model: rating (1-5), title, body, productId, userId, verified purchase flag
- Aggregation pipelines for average ratings and review statistics
- Error handling: custom error classes

## Database Patterns

- MongoDB via Mongoose
- Review schema with compound index on `productId` + `userId` (one review per product per user)
- Aggregation for rating averages, distribution histograms
- Timestamps enabled (`createdAt`, `updatedAt`)

## Security Rules

- JWT MUST be validated before accessing any controller logic
- Users may only submit one review per product per user account
- Users may only edit or delete their own reviews
- Validate all request bodies using validators
- Sanitize all inputs
- Rate limiting must be applied to review submission endpoints

## Error Handling Contract

All errors MUST follow this JSON structure:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "correlationId": "uuid"
  }
}
```

- Never expose stack traces in production
- Use centralized error middleware only

## Logging Rules

- Use structured JSON logging only
- Include:
  - timestamp
  - level
  - serviceName
  - correlationId
  - message
- Never log JWT tokens
- Never log secrets

## Testing Requirements

- All new controllers MUST have unit tests
- Use **Jest** as the test framework
- Babel config for ESM→CJS test transformation
- Mock MongoDB operations in unit tests
- Do NOT call real downstream services in unit tests
- Run: `npm test`

## Non-Goals

- This service is NOT responsible for product catalog management — handled by product-service
- This service does NOT handle user authentication or profile management
- This service does NOT manage order or payment data

## Environment Variables

```
PORT=8010
MONGODB_URL=mongodb://admin:admin123@localhost:27020/review-service?authSource=admin
JWT_SECRET=<shared-secret>
DAPR_HTTP_PORT=3500
```
