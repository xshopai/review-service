/**
 * Event Publisher for Review Service
 * Publishes events via messaging abstraction layer
 *
 * Uses the messaging factory pattern to support multiple providers:
 * - Dapr (default) - for Azure Container Apps, AKS, local Docker Compose
 * - RabbitMQ - for direct integration without Dapr
 * - Azure Service Bus - for Azure App Service deployments
 *
 * Provider is selected via MESSAGING_PROVIDER environment variable.
 */

import config from '../core/config.js';
import { logger } from '../core/logger.js';
import { getMessagingProvider } from '../messaging/index.js';

class EventPublisher {
  constructor() {
    this.serviceName = config.serviceName;
    this.provider = null;
  }

  /**
   * Initialize messaging provider
   */
  initialize() {
    try {
      this.provider = getMessagingProvider();
      logger.info('Event Publisher initialized', {
        serviceName: this.serviceName,
        provider: process.env.MESSAGING_PROVIDER || 'dapr',
      });
    } catch (error) {
      logger.error('Failed to initialize Event Publisher', {
        error: error.message,
      });
    }
  }

  /**
   * Publish an event via messaging provider with W3C Trace Context
   * @param {string} topic - Pub/sub topic
   * @param {string} eventType - CloudEvent type
   * @param {Object} data - Event data
   * @param {string} traceId - W3C trace ID (32 hex chars)
   * @param {string} spanId - W3C span ID (16 hex chars, optional - will generate if missing)
   */
  async publishEvent(topic, eventType, data, traceId = null, spanId = null) {
    if (!this.provider) {
      logger.warn('Messaging provider not initialized. Skipping event publish.', {
        eventType,
        topic,
      });
      return false;
    }

    // Generate span ID if not provided (16 hex characters)
    const eventSpanId = spanId || Math.random().toString(16).substring(2, 18).padEnd(16, '0');

    // Construct W3C traceparent header: version-traceId-spanId-flags
    const traceparent = traceId ? `00-${traceId}-${eventSpanId}-01` : null;

    const cloudEvent = {
      specversion: '1.0',
      type: eventType,
      source: this.serviceName,
      id: `${eventType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data: {
        ...data,
        timestamp: new Date().toISOString(),
      },
    };

    // Add traceparent header if traceId provided
    if (traceparent) {
      cloudEvent.traceparent = traceparent;
    }

    const success = await this.provider.publishEvent(topic, cloudEvent, traceId);

    if (success) {
      const log = traceId && spanId ? logger.withTraceContext(traceId, spanId) : logger;
      log.info(`Event published: ${eventType}`, {
        topic,
        eventType,
        dataSize: JSON.stringify(data).length,
        hasTraceContext: !!traceparent,
      });
    }

    return success;
  }

  /**
   * Publish review.created event with W3C Trace Context
   * @param {Object} review - Review document
   * @param {string} traceId - W3C trace ID
   * @param {string} spanId - W3C span ID
   */
  async publishReviewCreated(review, traceId = null, spanId = null) {
    const eventData = {
      reviewId: review._id?.toString() || review.reviewId,
      productId: review.productId?.toString() || review.productId,
      userId: review.userId?.toString() || review.userId,
      username: review.username,
      rating: review.rating,
      title: review.title || '',
      comment: review.comment || '',
      isVerifiedPurchase: review.isVerifiedPurchase || false,
      orderReference: review.orderReference || null,
      status: review.status || 'pending',
      helpfulCount: review.helpfulVotes?.helpful || 0,
      createdAt: review.createdAt?.toISOString() || new Date().toISOString(),
    };

    const metadata = {
      userId: eventData.userId,
      causationId: review.orderReference || null,
    };

    // Generate span ID if not provided
    const eventSpanId = spanId || Math.random().toString(16).substring(2, 18).padEnd(16, '0');
    const traceparent = traceId ? `00-${traceId}-${eventSpanId}-01` : null;

    const cloudEvent = {
      specversion: '1.0',
      type: 'review.created',
      source: this.serviceName,
      id: `review-created-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data: eventData,
      metadata: metadata,
    };

    // Add W3C traceparent header
    if (traceparent) {
      cloudEvent.traceparent = traceparent;
    }

    if (!this.provider) {
      logger.warn('Messaging provider not initialized. Skipping review.created event.', {
        reviewId: eventData.reviewId,
      });
      return false;
    }

    const success = await this.provider.publishEvent('review-events', cloudEvent, traceId);

    if (success) {
      const log = traceId && spanId ? logger.withTraceContext(traceId, spanId) : logger;
      log.info('Review created event published', {
        reviewId: eventData.reviewId,
        productId: eventData.productId,
      });
    }

    return success;
  }

  /**
   * Publish review.updated event with W3C Trace Context
   * @param {Object} review - Review document
   * @param {number} previousRating - Previous rating value
   * @param {string} traceId - W3C trace ID
   * @param {string} spanId - W3C span ID
   */
  async publishReviewUpdated(review, previousRating, traceId = null, spanId = null) {
    const eventData = {
      reviewId: review._id?.toString() || review.reviewId,
      productId: review.productId?.toString() || review.productId,
      userId: review.userId?.toString() || review.userId,
      username: review.username,
      rating: review.rating,
      previousRating: previousRating,
      title: review.title || '',
      comment: review.comment || '',
      isVerifiedPurchase: review.isVerifiedPurchase || false,
      status: review.status || 'pending',
      updatedAt: review.updatedAt?.toISOString() || new Date().toISOString(),
    };

    const metadata = {
      userId: eventData.userId,
    };

    // Generate span ID if not provided
    const eventSpanId = spanId || Math.random().toString(16).substring(2, 18).padEnd(16, '0');
    const traceparent = traceId ? `00-${traceId}-${eventSpanId}-01` : null;

    const cloudEvent = {
      specversion: '1.0',
      type: 'review.updated',
      source: this.serviceName,
      id: `review-updated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data: eventData,
      metadata: metadata,
    };

    // Add W3C traceparent header
    if (traceparent) {
      cloudEvent.traceparent = traceparent;
    }

    if (!this.provider) {
      logger.warn('Messaging provider not initialized. Skipping review.updated event.', {
        reviewId: eventData.reviewId,
      });
      return false;
    }

    const success = await this.provider.publishEvent('review-events', cloudEvent, traceId);

    if (success) {
      const log = traceId && spanId ? logger.withTraceContext(traceId, spanId) : logger;
      log.info('Review updated event published', {
        reviewId: eventData.reviewId,
        productId: eventData.productId,
        previousRating,
        newRating: eventData.rating,
      });
    }

    return success;
  }

  /**
   * Publish review.deleted event with W3C Trace Context
   * @param {Object} review - Review document
   * @param {string} traceId - W3C trace ID
   * @param {string} spanId - W3C span ID
   */
  async publishReviewDeleted(review, traceId = null, spanId = null) {
    const eventData = {
      reviewId: review._id?.toString() || review.reviewId,
      productId: review.productId?.toString() || review.productId,
      userId: review.userId?.toString() || review.userId,
      rating: review.rating || 0,
      isVerifiedPurchase: review.isVerifiedPurchase || false,
      deletedAt: new Date().toISOString(),
      deletedBy: review.deletedBy || review.userId?.toString(),
    };

    const metadata = {
      userId: eventData.userId,
    };

    // Generate span ID if not provided
    const eventSpanId = spanId || Math.random().toString(16).substring(2, 18).padEnd(16, '0');
    const traceparent = traceId ? `00-${traceId}-${eventSpanId}-01` : null;

    const cloudEvent = {
      specversion: '1.0',
      type: 'review.deleted',
      source: this.serviceName,
      id: `review-deleted-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data: eventData,
      metadata: metadata,
    };

    // Add W3C traceparent header
    if (traceparent) {
      cloudEvent.traceparent = traceparent;
    }

    if (!this.provider) {
      logger.warn('Messaging provider not initialized. Skipping review.deleted event.', {
        reviewId: eventData.reviewId,
      });
      return false;
    }

    const success = await this.provider.publishEvent('review-events', cloudEvent, traceId);

    if (success) {
      const log = traceId && spanId ? logger.withTraceContext(traceId, spanId) : logger;
      log.info('Review deleted event published', {
        reviewId: eventData.reviewId,
        productId: eventData.productId,
      });
    }

    return success;
  }

  /**
   * Close messaging provider
   */
  async close() {
    if (this.provider) {
      logger.info('Closing Event Publisher');
      await this.provider.close();
      this.provider = null;
    }
  }
}

// Export singleton instance
const eventPublisher = new EventPublisher();

export default eventPublisher;
