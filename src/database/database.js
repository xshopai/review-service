import mongoose from 'mongoose';
import { logger } from '../core/logger.js';
import { secretManager } from '../services/dapr.secretManager.js';

const connectDB = async () => {
  try {
    let mongodb_uri;

    // First, check if MONGODB_URI is provided directly via environment variable
    // This is the preferred method in Azure Container Apps
    if (process.env.MONGODB_URI) {
      mongodb_uri = process.env.MONGODB_URI;
      logger.info('Using MONGODB_URI from environment variable');
    } else {
      // Fall back to getting database configuration from Dapr Secret Manager
      logger.info('MONGODB_URI not found in environment, trying Dapr Secret Manager...');
      const dbConfig = await secretManager.getDatabaseConfig();

      // Force IPv4 by replacing 'localhost' with '127.0.0.1'
      const host = dbConfig.host === 'localhost' ? '127.0.0.1' : dbConfig.host;

      if (dbConfig.username && dbConfig.password) {
        mongodb_uri = `mongodb://${dbConfig.username}:${dbConfig.password}@${host}:${dbConfig.port}/${dbConfig.database}?authSource=${dbConfig.authSource}`;
      } else {
        mongodb_uri = `mongodb://${host}:${dbConfig.port}/${dbConfig.database}`;
      }
    }

    // Add database name if not in URI and MONGODB_DB_NAME is set
    const dbName = process.env.MONGODB_DB_NAME;
    if (dbName && !mongodb_uri.includes(`/${dbName}`)) {
      // For Cosmos DB connection strings, append the database name
      if (mongodb_uri.includes('cosmos.azure.com')) {
        // Cosmos DB connection string format
        const urlParts = mongodb_uri.split('?');
        if (urlParts.length === 2) {
          mongodb_uri = `${urlParts[0]}${dbName}?${urlParts[1]}`;
        } else {
          mongodb_uri = `${mongodb_uri}${dbName}`;
        }
      }
    }

    logger.info(`Connecting to MongoDB database: ${dbName || 'default'}`);

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
