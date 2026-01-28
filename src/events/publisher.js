/**
 * Dapr Event Publisher for Review Service
 * Publishes events via Dapr pub/sub component
 */

import { DaprClient, CommunicationProtocolEnum } from '@dapr/dapr';
import config from '../core/config.js';
import { logger } from '../core/logger.js';

class DaprEventPublisher {
  constructor() {
    this.serviceName = config.serviceName;
    this.pubsubName = 'pubsub';
    this.daprHost = process.env.DAPR_HOST || '127.0.0.1';
    this.daprPort = process.env.DAPR_HTTP_PORT || '3500';
    this.client = null;
  }

  /**
   * Initialize Dapr client
   */
  initialize() {
    this.client = new DaprClient({
      daprHost: this.daprHost,
      daprPort: this.daprPort,
      communicationProtocol: CommunicationProtocolEnum.HTTP,
    });
    logger.info('Dapr Event Publisher initialized', {
      pubsubName: this.pubsubName,
      daprHost: this.daprHost,
      daprPort: this.daprPort,
    });
  }

  /**
   * Publish an event via Dapr pub/sub with W3C Trace Context
   * @param {string} topic - Pub/sub topic
   * @param {string} eventType - CloudEvent type
   * @param {Object} data - Event data
   * @param {string} traceId - W3C trace ID (32 hex chars)
   * @param {string} spanId - W3C span ID (16 hex chars, optional - will generate if missing)
   */
  async publishEvent(topic, eventType, data, traceId = null, spanId = null) {
    if (!this.client) {
      logger.warn('Dapr client not initialized. Skipping event publish.', {
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

    await this.client.pubsub.publish(this.pubsubName, topic, cloudEvent);

    const log = traceId && spanId ? logger.withTraceContext(traceId, spanId) : logger;
    log.info(`Event published: ${eventType}`, {
      topic,
      eventType,
      pubsubName: this.pubsubName,
      dataSize: JSON.stringify(data).length,
      hasTraceContext: !!traceparent,
    });

    return true;
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

    if (!this.client) {
      logger.warn('Dapr client not initialized. Skipping review.created event.', {
        reviewId: eventData.reviewId,
      });
      return false;
    }

    await this.client.pubsub.publish(this.pubsubName, 'review-events', cloudEvent);

    const log = traceId && spanId ? logger.withTraceContext(traceId, spanId) : logger;
    log.info('Review created event published', {
      reviewId: eventData.reviewId,
      productId: eventData.productId,
    });

    return true;
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

    if (!this.client) {
      logger.warn('Dapr client not initialized. Skipping review.updated event.', {
        reviewId: eventData.reviewId,
      });
      return false;
    }

    await this.client.pubsub.publish(this.pubsubName, 'review-events', cloudEvent);

    const log = traceId && spanId ? logger.withTraceContext(traceId, spanId) : logger;
    log.info('Review updated event published', {
      reviewId: eventData.reviewId,
      productId: eventData.productId,
      previousRating,
      newRating: eventData.rating,
    });

    return true;
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

    if (!this.client) {
      logger.warn('Dapr client not initialized. Skipping review.deleted event.', {
        reviewId: eventData.reviewId,
      });
      return false;
    }

    await this.client.pubsub.publish(this.pubsubName, 'review-events', cloudEvent);

    const log = traceId && spanId ? logger.withTraceContext(traceId, spanId) : logger;
    log.info('Review deleted event published', {
      reviewId: eventData.reviewId,
      productId: eventData.productId,
    });

    return true;
  }

  /**
   * Close Dapr client
   */
  async close() {
    if (this.client) {
      logger.info('Closing Dapr Event Publisher');
      this.client = null;
    }
  }
}

// Export singleton instance
const eventPublisher = new DaprEventPublisher();

export default eventPublisher;
