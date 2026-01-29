/**
 * Azure Service Bus Provider Implementation
 * Architecture spec section 5.5.2
 *
 * For deployment to:
 * - Azure App Service (no Dapr sidecar available)
 *
 * Note: Requires @azure/service-bus package to be installed.
 */

import MessagingProvider from './provider.js';
import { logger } from '../core/logger.js';

/**
 * Azure Service Bus provider for App Service deployments.
 * Uses Azure Service Bus SDK directly (no Dapr sidecar).
 */
class ServiceBusProvider extends MessagingProvider {
  /**
   * Initialize Service Bus provider.
   *
   * @param {Object} options - Configuration options
   * @param {string} options.connectionString - Azure Service Bus connection string
   * @param {string} options.topicName - Service Bus topic name
   */
  constructor(options = {}) {
    super();
    this.connectionString = options.connectionString || process.env.SERVICEBUS_CONNECTION_STRING;
    this.topicName = options.topicName || process.env.SERVICEBUS_TOPIC_NAME;
    this.client = null;
    this.sender = null;

    if (!this.connectionString) {
      throw new Error('SERVICEBUS_CONNECTION_STRING is required for ServiceBusProvider');
    }
    if (!this.topicName) {
      throw new Error('SERVICEBUS_TOPIC_NAME is required for ServiceBusProvider');
    }

    logger.info('Initialized ServiceBusProvider', {
      operation: 'messaging_init',
      provider: 'servicebus',
      topicName: this.topicName,
    });
  }

  /**
   * Initialize Service Bus client (lazy, singleton).
   * @returns {Promise<void>}
   */
  async _initializeClient() {
    if (this.sender) {
      return;
    }

    try {
      // Dynamic import to avoid dependency if not using Service Bus
      const { ServiceBusClient } = await import('@azure/service-bus');

      this.client = new ServiceBusClient(this.connectionString);
      this.sender = this.client.createSender(this.topicName);

      logger.info('Service Bus client initialized successfully', {
        operation: 'messaging_connect',
        provider: 'servicebus',
        topicName: this.topicName,
      });
    } catch (error) {
      logger.error('Failed to initialize Service Bus client', {
        operation: 'messaging_connect',
        provider: 'servicebus',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Publish event to Azure Service Bus.
   *
   * @param {string} topic - Event topic (used as message subject)
   * @param {Object} eventData - CloudEvents payload
   * @param {string} [correlationId] - Correlation ID for tracing
   * @returns {Promise<boolean>} True if published successfully
   */
  async publishEvent(topic, eventData, correlationId = null) {
    try {
      await this._initializeClient();

      if (!this.sender) {
        logger.error('Service Bus sender not initialized', {
          operation: 'event_publish',
          provider: 'servicebus',
        });
        return false;
      }

      // Create message with CloudEvents payload
      const message = {
        body: eventData,
        contentType: 'application/json',
        subject: topic, // Event type as subject
        correlationId: correlationId || undefined,
        applicationProperties: {
          eventType: topic,
        },
      };

      await this.sender.sendMessages(message);

      logger.info('Published event via Service Bus', {
        operation: 'event_publish',
        provider: 'servicebus',
        topic,
        topicName: this.topicName,
        correlationId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to publish event via Service Bus', {
        operation: 'event_publish',
        provider: 'servicebus',
        topic,
        correlationId,
        error: error.message,
      });

      return false;
    }
  }

  /**
   * Close Service Bus connections.
   * @returns {Promise<void>}
   */
  async close() {
    try {
      if (this.sender) {
        await this.sender.close();
        this.sender = null;
      }
      if (this.client) {
        await this.client.close();
        this.client = null;
      }

      logger.info('Closed Service Bus connection', {
        operation: 'messaging_close',
        provider: 'servicebus',
      });
    } catch (error) {
      logger.error('Error closing Service Bus connection', {
        operation: 'messaging_close',
        provider: 'servicebus',
        error: error.message,
      });
    }
  }
}

export default ServiceBusProvider;
