import dotenv from 'dotenv';

dotenv.config();

const config = {
  serviceName: process.env.SERVICE_NAME || 'review-service',
  serviceVersion: process.env.VERSION || '1.0.0',
  env: process.env.NODE_ENV || 'development',

  // Service Invocation Mode (for consistency with other services)
  serviceInvocationMode: process.env.SERVICE_INVOCATION_MODE || 'http',

  server: {
    port: process.env.PORT || 8010,
    host: process.env.HOST || '0.0.0.0',
  },
  security: {
    // JWT_SECRET is loaded from environment variables
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },
  dapr: {
    httpPort: process.env.DAPR_HTTP_PORT || '3500',
    grpcPort: process.env.DAPR_GRPC_PORT || '50001',
    pubsubName: 'pubsub',
  },
  upload: {
    maxFileSize: process.env.MAX_FILE_SIZE || '10MB',
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    uploadDir: process.env.UPLOAD_DIR || './uploads',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
    format: process.env.LOG_FORMAT || 'console',
    enableFile: process.env.LOG_TO_FILE === 'true',
    enableConsole: process.env.LOG_TO_CONSOLE !== 'false',
  },
  review: {
    // Whether purchase is required to create a review
    requirePurchase: process.env.REVIEW_REQUIRE_PURCHASE === 'true',
    // Whether to auto-approve reviews from verified purchases
    autoApproveVerified: process.env.REVIEW_AUTO_APPROVE_VERIFIED !== 'false',
    // Whether reviews require moderation before being visible
    moderationRequired: process.env.REVIEW_MODERATION_REQUIRED === 'true',
    // Maximum number of reviews per user per product (normally 1)
    maxReviewsPerProduct: parseInt(process.env.REVIEW_MAX_PER_PRODUCT) || 1,
    // Time limit in days for editing reviews (0 = no limit)
    editTimeLimitDays: parseInt(process.env.REVIEW_EDIT_TIME_LIMIT_DAYS) || 0,
  },
};

export default config;
