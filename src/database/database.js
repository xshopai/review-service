import mongoose from 'mongoose';
import { logger } from '../core/logger.js';
import { secretManager } from '../services/dapr.secretManager.js';

const connectDB = async () => {
  try {
    let mongodb_uri;

    // Try Dapr secret store first (works in both local and Azure)
    try {
      mongodb_uri = await secretManager.getSecret('MONGODB_URI');
      if (mongodb_uri) {
        logger.info('Using MONGODB_URI from Dapr secret store');
      }
    } catch (error) {
      logger.debug('MONGODB_URI not found in Dapr secret store');
    }

    // Fall back to environment variable (for ACA env var injection or non-Dapr runs)
    if (!mongodb_uri && process.env.MONGODB_URI) {
      mongodb_uri = process.env.MONGODB_URI;
      logger.info('Using MONGODB_URI from environment variable');
    }

    if (!mongodb_uri) {
      throw new Error(
        'MongoDB connection string not found. ' +
          'Set MONGODB_URI in Dapr secret store (.dapr/secrets.json) or as env var.',
      );
    }

    // Force IPv4 by replacing 'localhost' with '127.0.0.1'
    mongodb_uri = mongodb_uri.replace('localhost', '127.0.0.1');

    const dbName = process.env.MONGODB_DB_NAME || 'review_service_db';
    logger.info(`Connecting to MongoDB database: ${dbName}`);

    // Set global promise library
    mongoose.Promise = global.Promise;

    // Set strictQuery to false to prepare for Mongoose 7
    mongoose.set('strictQuery', false);

    // Connect to MongoDB with connection options
    const conn = await mongoose.connect(mongodb_uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4
    });

    logger.info(`MongoDB connected: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed due to application termination');
        process.exit(0);
      } catch (error) {
        logger.error(`Error during MongoDB disconnection: ${error.message}`);
        process.exit(1);
      }
    });

    return conn;
  } catch (error) {
    logger.error(`Error occurred while connecting to MongoDB: ${error.message}`);
    throw error;
  }
};

export default connectDB;
