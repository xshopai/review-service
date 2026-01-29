/**
 * Messaging Abstraction Layer for Review Service
 * Implements Architecture spec section 5.5
 *
 * Provides a unified interface for event publishing across different
 * messaging providers (Dapr, RabbitMQ, Azure Service Bus).
 *
 * Usage:
 * ```javascript
 * import { getMessagingProvider } from './messaging/index.js';
 *
 * const messaging = getMessagingProvider();
 * await messaging.publishEvent('review.created', eventData, correlationId);
 * ```
 */

export { default as MessagingProvider } from './provider.js';
export { default as DaprProvider } from './daprProvider.js';
export { default as RabbitMQProvider } from './rabbitmqProvider.js';
export { default as ServiceBusProvider } from './servicebusProvider.js';
export { createMessagingProvider, getMessagingProvider, closeMessagingProvider } from './factory.js';
