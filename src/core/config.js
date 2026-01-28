import dotenv from 'dotenv';

dotenv.config();

const config = {
  serviceName: process.env.NAME || 'review-service',
  serviceVersion: process.env.VERSION || '1.0.0',
  env: process.env.NODE_ENV || 'development',
  server: {
    port: process.env.PORT || 9001,
    host: process.env.HOST || '0.0.0.0',
  },
  security: {
    // For JWT secret, use: await getJwtConfig() from dapr.secretManager
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },
  dapr: {
    httpPort: process.env.DAPR_HTTP_PORT || '3500',
    grpcPort: process.env.DAPR_GRPC_PORT || '50001',
    host: process.env.DAPR_HOST || 'localhost',
    pubsubName: 'pubsub',
    appId: process.env.DAPR_APP_ID || 'review-service',
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
};

export default config;
