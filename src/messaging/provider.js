/**
 * Base Messaging Provider Interface
 * Architecture spec section 5.5.2
 *
 * Defines the abstract interface for all messaging providers.
 * Enables deployment flexibility across different Azure hosting options.
 */

/**
 * @typedef {Object} MessagingProvider
 * @property {function(string, Object, string?): Promise<boolean>} publishEvent - Publish an event
 * @property {function(): Promise<void>} close - Cleanup method
 */

/**
 * Abstract base class for messaging providers.
 * All provider implementations must extend this class.
 */
class MessagingProvider {
  /**
   * Publish an event to the messaging infrastructure.
   *
   * @param {string} topic - Event topic/type (e.g., 'review.created')
   * @param {Object} eventData - CloudEvents-compliant event payload
   * @param {string} [correlationId] - Optional correlation ID for tracing
   * @returns {Promise<boolean>} True if published successfully, false otherwise
   * @abstract
   */
  async publishEvent(topic, eventData, _correlationId = null) {
    throw new Error('Method publishEvent() must be implemented by subclass');
  }

  /**
   * Clean up resources and close connections.
   * @returns {Promise<void>}
   * @abstract
   */
  async close() {
    throw new Error('Method close() must be implemented by subclass');
  }
}

export default MessagingProvider;
