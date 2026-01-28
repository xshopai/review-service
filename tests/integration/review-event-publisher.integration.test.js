/**
 * Integration Test for Review-Product Service Event Flow
 * Tests the complete event-driven communication via Dapr pub/sub
 */

import { jest } from '@jest/globals';
import eventPublisher from '../../src/events/publisher.js';
import reviewService from '../../src/services/review.service.js';
import Review from '../../src/models/review.model.js';

// Mock Dapr client
jest.mock('@dapr/dapr');

describe('Review-Product Service Event Integration', () => {
  let mockDaprClient;
  let publishedEvents = [];

  beforeEach(() => {
    // Clear published events
    publishedEvents = [];

    // Mock Dapr client
    mockDaprClient = {
      pubsub: {
        publish: jest.fn().mockImplementation((pubsubName, topic, event) => {
          publishedEvents.push({ pubsubName, topic, event });
          return Promise.resolve();
        }),
      },
      invoker: {
        invoke: jest.fn().mockResolvedValue({ exists: true }),
      },
    };

    // Initialize event publisher with mock client
    eventPublisher.client = mockDaprClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Review Created Event', () => {
    it('should publish review.created event with correct schema when review is created', async () => {
      const reviewData = {
        reviewId: 'review-12345',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-67890',
        rating: 5,
        title: 'Excellent quality!',
        comment: 'Love this t-shirt, fits perfectly',
        isVerifiedPurchase: true,
        createdAt: new Date().toISOString(),
      };

      const correlationId = 'test-correlation-123';

      // Publish event
      await eventPublisher.publishReviewCreated(reviewData, correlationId);

      // Verify event was published
      expect(mockDaprClient.pubsub.publish).toHaveBeenCalledTimes(1);
      expect(publishedEvents).toHaveLength(1);

      const publishedEvent = publishedEvents[0];

      // Verify pub/sub name and topic
      expect(publishedEvent.pubsubName).toBe('pubsub');
      expect(publishedEvent.topic).toBe('review-events'); // Updated to match new schema

      // Verify CloudEvents structure
      const event = publishedEvent.event;
      expect(event).toMatchObject({
        specversion: '1.0',
        type: 'review.created',
        source: 'review-service',
        datacontenttype: 'application/json',
      });

      // Verify event has required fields
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('time');

      // Verify event data (camelCase for Node.js)
      expect(event.data).toMatchObject({
        reviewId: reviewData.reviewId,
        productId: reviewData.productId,
        userId: reviewData.userId,
        rating: reviewData.rating,
        title: reviewData.title,
        comment: reviewData.comment,
        isVerifiedPurchase: true, // Updated field name
      });

      // Verify metadata structure (updated schema)
      expect(event.metadata).toMatchObject({
        correlationId: expect.any(String),
        userId: reviewData.userId,
      });
    });

    it('should include correlation ID in event', async () => {
      const reviewData = {
        reviewId: 'review-12345',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-67890',
        rating: 4,
        title: 'Good product',
        comment: 'Works well',
        isVerifiedPurchase: false,
        createdAt: new Date().toISOString(),
      };

      const correlationId = 'correlation-456';

      await eventPublisher.publishReviewCreated(reviewData, correlationId);

      const event = publishedEvents[0].event;
      expect(event.id).toContain(correlationId);
      expect(event.data).toHaveProperty('timestamp');
    });
  });

  describe('Review Updated Event', () => {
    it('should publish review.updated event with previousRating when review is updated', async () => {
      const reviewData = {
        reviewId: 'review-12345',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-67890',
        rating: 4,
        previousRating: 3,
        title: 'Updated review',
        comment: 'Changed my mind after using it more',
        isVerifiedPurchase: true,
        updatedAt: new Date().toISOString(),
      };

      const correlationId = 'update-correlation-789';

      await eventPublisher.publishReviewUpdated(reviewData, correlationId);

      expect(publishedEvents).toHaveLength(1);
      const publishedEvent = publishedEvents[0];

      expect(publishedEvent.topic).toBe('review-events'); // Updated
      expect(publishedEvent.event.type).toBe('review.updated');

      const eventData = publishedEvent.event.data;
      expect(eventData).toMatchObject({
        reviewId: reviewData.reviewId,
        productId: reviewData.productId,
        userId: reviewData.userId,
        rating: 4,
        previousRating: 3,
        isVerifiedPurchase: true, // Updated field name
      });

      expect(eventData).toHaveProperty('updatedAt');
    });

    it('should handle null previousRating', async () => {
      const reviewData = {
        reviewId: 'review-12345',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-67890',
        rating: 5,
        previousRating: null,
        title: 'Great product',
        comment: 'First update',
        isVerifiedPurchase: false,
        updatedAt: new Date().toISOString(),
      };

      await eventPublisher.publishReviewUpdated(reviewData, 'test-corr');

      const eventData = publishedEvents[0].event.data;
      expect(eventData.previousRating).toBeNull();
    });
  });

  describe('Review Deleted Event', () => {
    it('should publish review.deleted event with rating and verification status', async () => {
      const deleteData = {
        reviewId: 'review-12345',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-67890',
        rating: 5,
        isVerifiedPurchase: true,
      };

      const correlationId = 'delete-correlation-xyz';

      await eventPublisher.publishReviewDeleted(deleteData, correlationId);

      expect(publishedEvents).toHaveLength(1);
      const publishedEvent = publishedEvents[0];

      expect(publishedEvent.topic).toBe('review-events'); // Updated
      expect(publishedEvent.event.type).toBe('review.deleted');

      const eventData = publishedEvent.event.data;
      expect(eventData).toMatchObject({
        reviewId: deleteData.reviewId,
        productId: deleteData.productId,
        userId: deleteData.userId,
        rating: 5,
        isVerifiedPurchase: true, // Updated field name
      });

      expect(eventData).toHaveProperty('deletedAt');
    });

    it('should handle unverified review deletion', async () => {
      const deleteData = {
        reviewId: 'review-99999',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-00000',
        rating: 2,
        isVerifiedPurchase: false,
      };

      await eventPublisher.publishReviewDeleted(deleteData, 'test-corr');

      const eventData = publishedEvents[0].event.data;
      expect(eventData.isVerifiedPurchase).toBe(false); // Updated field name
      expect(eventData.rating).toBe(2);
    });
  });

  describe('Event Schema Validation', () => {
    it('should always include required CloudEvents fields', async () => {
      const reviewData = {
        reviewId: 'test-review',
        productId: 'test-product',
        userId: 'test-user',
        rating: 5,
        title: 'Test',
        comment: 'Test comment',
        isVerifiedPurchase: false,
        createdAt: new Date().toISOString(),
      };

      await eventPublisher.publishReviewCreated(reviewData, 'test-corr');

      const event = publishedEvents[0].event;

      // Required CloudEvents fields
      expect(event).toHaveProperty('specversion', '1.0');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('source');
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('time');
      expect(event).toHaveProperty('datacontenttype', 'application/json');
      expect(event).toHaveProperty('data');
    });

    it('should include metadata in all events', async () => {
      const reviewData = {
        reviewId: 'test',
        productId: 'test',
        userId: 'test',
        username: 'testuser',
        rating: 3,
        title: 'Test',
        comment: 'Test',
        isVerifiedPurchase: true,
        createdAt: new Date().toISOString(),
      };

      await eventPublisher.publishReviewCreated(reviewData, 'test');

      const event = publishedEvents[0].event;
      // Updated: metadata is at root level, not in data
      expect(event.metadata).toMatchObject({
        correlationId: expect.any(String),
        userId: reviewData.userId,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Dapr publish failures gracefully', async () => {
      mockDaprClient.pubsub.publish.mockRejectedValue(new Error('Dapr connection failed'));

      const reviewData = {
        reviewId: 'test',
        productId: 'test',
        userId: 'test',
        rating: 5,
        title: 'Test',
        comment: 'Test',
        isVerifiedPurchase: false,
        createdAt: new Date().toISOString(),
      };

      // Should not throw error
      await expect(eventPublisher.publishReviewCreated(reviewData, 'test')).rejects.toThrow();
    });

    it('should handle missing Dapr client', async () => {
      eventPublisher.client = null;

      const reviewData = {
        reviewId: 'test',
        productId: 'test',
        userId: 'test',
        rating: 5,
        title: 'Test',
        comment: 'Test',
        isVerifiedPurchase: false,
        createdAt: new Date().toISOString(),
      };

      const result = await eventPublisher.publishReviewCreated(reviewData, 'test');
      expect(result).toBe(false);
    });
  });

  describe('Product Service Expectations', () => {
    it('should publish events with data required by product service consumer', async () => {
      const reviewData = {
        reviewId: 'review-12345',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-67890',
        rating: 5,
        title: 'Excellent!',
        comment: 'Perfect',
        isVerifiedPurchase: true,
        createdAt: '2025-11-06T10:00:00Z',
      };

      await eventPublisher.publishReviewCreated(reviewData, 'test-correlation');

      const eventData = publishedEvents[0].event.data;

      // Fields required by product service for aggregate calculation
      expect(eventData).toHaveProperty('reviewId');
      expect(eventData).toHaveProperty('productId');
      expect(eventData).toHaveProperty('rating');
      expect(typeof eventData.rating).toBe('number');
      expect(eventData.rating).toBeGreaterThanOrEqual(1);
      expect(eventData.rating).toBeLessThanOrEqual(5);
      expect(eventData).toHaveProperty('isVerifiedPurchase'); // Updated field name
      expect(typeof eventData.isVerifiedPurchase).toBe('boolean');
      expect(eventData).toHaveProperty('createdAt');
    });

    it('should publish update events with previousRating for recalculation', async () => {
      const reviewData = {
        reviewId: 'review-12345',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-67890',
        rating: 3,
        previousRating: 5,
        title: 'Changed rating',
        comment: 'Not as good as I thought',
        isVerifiedPurchase: true,
        updatedAt: new Date().toISOString(),
      };

      await eventPublisher.publishReviewUpdated(reviewData, 'test-correlation');

      const eventData = publishedEvents[0].event.data;

      // Product service needs both ratings to recalculate average
      expect(eventData.rating).toBe(3);
      expect(eventData.previousRating).toBe(5);
    });

    it('should publish delete events with rating for aggregate adjustment', async () => {
      const deleteData = {
        reviewId: 'review-12345',
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-67890',
        rating: 4,
        isVerifiedPurchase: true,
      };

      await eventPublisher.publishReviewDeleted(deleteData, 'test-correlation');

      const eventData = publishedEvents[0].event.data;

      // Product service needs rating to subtract from aggregate
      expect(eventData).toHaveProperty('rating', 4);
      expect(eventData).toHaveProperty('isVerifiedPurchase', true); // Updated field name
    });
  });
});
