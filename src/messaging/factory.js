/**
 * Messaging Provider Factory
 * Architecture spec section 5.5.3
 *
 * Selects the appropriate provider based on environment configuration.
 * Enables deployment flexibility across Azure hosting options.
 */

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
 * @returns {Promise<import('./provider.js').default>} Configured provider instance
 * @throws {Error} If provider type is invalid or required config is missing
 */
export async function createMessagingProvider(options = {}) {
  // Get provider type from environment, default to Dapr
  const providerType = (options.provider || process.env.MESSAGING_PROVIDER || 'dapr').toLowerCase();

  logger.info('Creating messaging provider', {
    operation: 'messaging_factory',
    providerType,
  });

  // Lazy import providers - only loads the SDK that's actually needed
  switch (providerType) {
    case 'dapr': {
      const { default: DaprProvider } = await import('./daprProvider.js');
      return new DaprProvider(options);
    }

    case 'rabbitmq': {
      const { default: RabbitMQProvider } = await import('./rabbitmqProvider.js');
      return new RabbitMQProvider(options);
    }

    case 'servicebus': {
      const { default: ServiceBusProvider } = await import('./servicebusProvider.js');
      return new ServiceBusProvider(options);
    }

    default:
      throw new Error(`Invalid MESSAGING_PROVIDER: ${providerType}. ` + `Must be 'dapr', 'rabbitmq', or 'servicebus'`);
  }
}

/**
 * Get the singleton messaging provider instance.
 * Creates a new instance on first call using environment configuration.
 *
 * @returns {Promise<import('./provider.js').default>} Messaging provider instance
 */
export async function getMessagingProvider() {
  if (!messagingProvider) {
    messagingProvider = await createMessagingProvider();
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
