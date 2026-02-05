import express from 'express';
import cors from 'cors';

import config from './core/config.js';
import { logger } from './core/logger.js';
import connectDB from './database/database.js';
import traceContextMiddleware from './middleware/traceContext.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import reviewRoutes from './routes/review.routes.js';
import adminRoutes from './routes/admin.routes.js';
import homeRoutes from './routes/home.routes.js';
import operationalRoutes from './routes/operational.routes.js';
import eventPublisher from './events/publisher.js';

const app = express();
app.set('trust proxy', true);

// Apply CORS before other middlewares
app.use(
  cors({
    origin: config.security.corsOrigin,
    credentials: true,
  }),
);

app.use(traceContextMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to database
await connectDB();

// Initialize event publisher for Dapr pub/sub
try {
  await eventPublisher.initialize();
  logger.info('Event publisher initialized successfully');
} catch (error) {
  logger.warn('Failed to initialize event publisher. Events will not be published.', {
    error: error.message,
  });
}

// Routes
app.use('/', homeRoutes);
app.use('/', operationalRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

// Error handler
app.use(errorHandler);

const PORT = parseInt(process.env.PORT, 10) || 9001;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info(`Review service running on ${HOST}:${PORT} in ${process.env.NODE_ENV} mode`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
