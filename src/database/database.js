import mongoose from 'mongoose';
import { logger } from '../core/logger.js';

const connectDB = async () => {
  try {
    let mongodb_uri = process.env.MONGODB_URI;

    if (!mongodb_uri) {
      throw new Error('MongoDB connection string not found. Set MONGODB_URI environment variable.');
    }

    // Force IPv4 by replacing 'localhost' with '127.0.0.1'
    mongodb_uri = mongodb_uri.replace('localhost', '127.0.0.1');

    const dbName = process.env.MONGODB_DB_NAME || 'review_service_db';
    logger.info(`Connecting to MongoDB database: ${dbName}`);

    // Set global promise library
    mongoose.Promise = global.Promise;

    // Set strictQuery to false to prepare for Mongoose 7
    mongoose.set('strictQuery', false);

    // Check if this is Azure Cosmos DB
    const isCosmosDB = mongodb_uri.includes('cosmos.azure.com') || mongodb_uri.includes(':10255');

    // Connection options
    const connectionOptions = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: isCosmosDB ? 30000 : 5000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4
    };

    // Add TLS options for Cosmos DB
    if (isCosmosDB) {
      connectionOptions.tls = true;
      connectionOptions.retryWrites = false;
      logger.info('Using Cosmos DB connection settings (TLS enabled)');
    }

    // Connect to MongoDB with connection options
    const conn = await mongoose.connect(mongodb_uri, connectionOptions);

    logger.info(`MongoDB connected: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);

    // Ensure indexes are created (required for Cosmos DB MongoDB API)
    if (isCosmosDB) {
      try {
        const Review = (await import('../models/review.model.js')).default;
        await Review.createIndexes();
        logger.info('Database indexes synchronized for Cosmos DB');
      } catch (indexError) {
        // Log but don't fail - indexes might already exist
        logger.warn(`Index synchronization warning: ${indexError.message}`);
      }
    }

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
