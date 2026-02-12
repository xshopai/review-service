/**
 * RabbitMQ Provider Implementation
 * Architecture spec section 5.5.2
 *
 * For deployment to:
 * - Local development without Dapr
 * - Direct RabbitMQ integration scenarios
 *
 * Note: Requires amqplib package to be installed.
 */

import MessagingProvider from './provider.js';
import { logger } from '../core/logger.js';

/**
 * Direct RabbitMQ provider for local development.
 * Uses amqplib to connect to RabbitMQ directly.
 */
class RabbitMQProvider extends MessagingProvider {
  /**
   * Initialize RabbitMQ provider.
   *
   * @param {Object} options - Configuration options
   * @param {string} options.url - RabbitMQ connection URL
   * @param {string} [options.exchange='xshopai.events'] - Exchange name for event publishing
   */
  constructor(options = {}) {
    super();
    this.url = options.url || process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    this.exchange = options.exchange || process.env.RABBITMQ_EXCHANGE || 'xshopai.events';
    this.connection = null;
    this.channel = null;
    this._connectionPromise = null;

    logger.info('Initialized RabbitMQProvider', {
      operation: 'messaging_init',
      provider: 'rabbitmq',
      exchange: this.exchange,
    });
  }

  /**
   * Initialize RabbitMQ connection (lazy, singleton).
   * @returns {Promise<void>}
   */
  async _initializeConnection() {
    if (this.channel) {
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (this._connectionPromise) {
      return this._connectionPromise;
    }

    this._connectionPromise = (async () => {
      try {
        // Dynamic import to avoid dependency if not using RabbitMQ
        const amqp = await import('amqplib');

        this.connection = await amqp.connect(this.url);
        this.channel = await this.connection.createChannel();

        // Declare exchange
        await this.channel.assertExchange(this.exchange, 'topic', { durable: true });

        logger.info('RabbitMQ connection initialized successfully', {
          operation: 'messaging_connect',
          provider: 'rabbitmq',
          exchange: this.exchange,
        });
      } catch (error) {
        logger.error('Failed to initialize RabbitMQ connection', {
          operation: 'messaging_connect',
          provider: 'rabbitmq',
          error: error.message,
        });
        this._connectionPromise = null;
        throw error;
      }
    })();

    return this._connectionPromise;
  }

  /**
   * Publish event to RabbitMQ exchange.
   *
   * @param {string} topic - Event topic (used as routing key)
   * @param {Object} eventData - CloudEvents payload
   * @param {string} [correlationId] - Correlation ID for tracing
   * @returns {Promise<boolean>} True if published successfully
   */
  async publishEvent(topic, eventData, correlationId = null) {
    try {
      await this._initializeConnection();

      if (!this.channel) {
        logger.error('RabbitMQ channel not initialized', {
          operation: 'event_publish',
          provider: 'rabbitmq',
        });
        return false;
      }

      // Publish message to exchange with topic as routing key
      const message = Buffer.from(JSON.stringify(eventData));
      const options = {
        contentType: 'application/json',
        persistent: true, // Delivery mode 2
        correlationId: correlationId || undefined,
      };

      this.channel.publish(this.exchange, topic, message, options);

      logger.info('Published event via RabbitMQ', {
        operation: 'event_publish',
        provider: 'rabbitmq',
        topic,
        exchange: this.exchange,
        correlationId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to publish event via RabbitMQ', {
        operation: 'event_publish',
        provider: 'rabbitmq',
        topic,
        correlationId,
        error: error.message,
      });

      return false;
    }
  }

  /**
   * Close RabbitMQ connection.
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this._connectionPromise = null;

      logger.info('Closed RabbitMQ connection', {
        operation: 'messaging_close',
        provider: 'rabbitmq',
      });
    } catch (error) {
      logger.error('Error closing RabbitMQ connection', {
        operation: 'messaging_close',
        provider: 'rabbitmq',
        error: error.message,
      });
    }
  }
}

export default RabbitMQProvider;
