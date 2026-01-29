/**
 * Messaging Provider Factory
 * Architecture spec section 5.5.3
 *
 * Selects the appropriate provider based on environment configuration.
 * Enables deployment flexibility across Azure hosting options.
 */

import DaprProvider from './daprProvider.js';
import RabbitMQProvider from './rabbitmqProvider.js';
import ServiceBusProvider from './servicebusProvider.js';
import { logger } from '../core/logger.js';

/**
 * Singleton instance of the messaging provider.
 * @type {import('./provider.js').default|null}
 */
let messagingProvider = null;

/**
 * Create messaging provider based on MESSAGING_PROVIDER environment variable.
 *
 * This factory pattern enables the same codebase to deploy across different
 * Azure hosting options without code changes, only configuration.
 *
 * Environment Variables:
 * - MESSAGING_PROVIDER: 'dapr', 'rabbitmq', or 'servicebus' (default: 'dapr')
 * - For DaprProvider: DAPR_HTTP_PORT, DAPR_HOST
 * - For RabbitMQProvider: RABBITMQ_URL, RABBITMQ_EXCHANGE
 * - For ServiceBusProvider: SERVICEBUS_CONNECTION_STRING, SERVICEBUS_TOPIC_NAME
 *
 * @param {Object} [options] - Optional configuration to override env vars
 * @returns {import('./provider.js').default} Configured provider instance
 * @throws {Error} If provider type is invalid or required config is missing
 */
export function createMessagingProvider(options = {}) {
  // Get provider type from environment, default to Dapr
  const providerType = (options.provider || process.env.MESSAGING_PROVIDER || 'dapr').toLowerCase();

  logger.info('Creating messaging provider', {
    operation: 'messaging_factory',
    providerType,
  });

  // Select provider based on configuration
  switch (providerType) {
    case 'dapr':
      return new DaprProvider(options);

    case 'rabbitmq':
      return new RabbitMQProvider(options);

    case 'servicebus':
      return new ServiceBusProvider(options);

    default:
      throw new Error(`Invalid MESSAGING_PROVIDER: ${providerType}. ` + `Must be 'dapr', 'rabbitmq', or 'servicebus'`);
  }
}

/**
 * Get the singleton messaging provider instance.
 * Creates a new instance on first call using environment configuration.
 *
 * @returns {import('./provider.js').default} Messaging provider instance
 */
export function getMessagingProvider() {
  if (!messagingProvider) {
    messagingProvider = createMessagingProvider();
  }
  return messagingProvider;
}

/**
 * Close and reset the singleton messaging provider.
 * Useful for graceful shutdown and testing.
 *
 * @returns {Promise<void>}
 */
export async function closeMessagingProvider() {
  if (messagingProvider) {
    await messagingProvider.close();
    messagingProvider = null;
  }
}

export default {
  createMessagingProvider,
  getMessagingProvider,
  closeMessagingProvider,
};
