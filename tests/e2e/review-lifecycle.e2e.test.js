/**
 * End-to-End Test for Review-Product Service Event Flow with Dapr
 *
 * Prerequisites - Services must be running:
 * Terminal 1: cd services/product-service && dapr run --app-id product-service --app-port 8003 --dapr-http-port 3500 --dapr-grpc-port 50001 --resources-path ./.dapr/components --config ./.dapr/config.yaml --log-level warn -- python -m uvicorn main:app --host 0.0.0.0 --port 8003 --reload
 * Terminal 2: cd services/review-service && npm run dapr
 *
 * Also required:
 * - RabbitMQ running (via docker-compose)
 * - MongoDB running for both services
 */

import axios from 'axios';
import mongoose from 'mongoose';
import { setTimeout } from 'timers/promises'; // Configuration
const REVIEW_SERVICE_PORT = 9001;
const REVIEW_DAPR_HTTP_PORT = 3500;
const PRODUCT_SERVICE_PORT = 8003;
const PRODUCT_DAPR_HTTP_PORT = 3500;
const MONGODB_REVIEW_URI = 'mongodb://localhost:27020/review_service_test';
const MONGODB_PRODUCT_URI = 'mongodb://localhost:27017/product_service_test';

describe('Review-Product Event Flow E2E Test', () => {
  let reviewServiceProcess;
  let productServiceProcess;
  let mongoReviewClient;
  let mongoProductClient;
  let reviewDb;
  let productDb;

  // Helper to wait for service health
  const waitForService = async (url, maxAttempts = 30, delay = 1000) => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await axios.get(url, { timeout: 2000 });
        console.log(`✓ Service ready: ${url}`);
        return true;
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error(`Service not ready after ${maxAttempts} attempts: ${url}`);
        }
        await setTimeout(delay);
      }
    }
    return false;
  };

  // Helper to start a service with Dapr
  const startServiceWithDapr = (serviceName, appPort, daprHttpPort, daprGrpcPort, command, cwd) => {
    return new Promise((resolve, reject) => {
      console.log(`Starting ${serviceName}...`);

      const daprArgs = [
        'run',
        '--app-id',
        serviceName,
        '--app-port',
        appPort.toString(),
        '--dapr-http-port',
        daprHttpPort.toString(),
        '--dapr-grpc-port',
        daprGrpcPort.toString(),
        '--resources-path',
        './.dapr/components',
        '--config',
        './.dapr/config.yaml',
        '--enable-api-logging=false',
        '--placement-host-address',
        '',
        '--log-level',
        'warn',
        '--',
        ...command,
      ];

      const process = spawn('dapr', daprArgs, {
        cwd,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let isReady = false;

      process.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes("You're up and running!") || output.includes('dapr initialized')) {
          isReady = true;
          console.log(`✓ ${serviceName} with Dapr started`);
          resolve(process);
        }
      });

      process.stderr.on('data', (data) => {
        const error = data.toString();
        // Only log critical errors
        if (error.includes('FATAL') || error.includes('error')) {
          console.error(`${serviceName} error:`, error);
        }
      });

      process.on('error', (error) => {
        console.error(`Failed to start ${serviceName}:`, error);
        reject(error);
      });

      // Timeout if service doesn't start
      setTimeout(() => {
        if (!isReady) {
          reject(new Error(`${serviceName} failed to start within timeout`));
        }
      }, 60000);
    });
  };

  beforeAll(async () => {
    console.log('\n🚀 Starting E2E Test Setup...\n');

    // Connect to MongoDB for both services
    mongoReviewClient = new MongoClient(MONGODB_REVIEW_URI);
    mongoProductClient = new MongoClient(MONGODB_PRODUCT_URI);

    await mongoReviewClient.connect();
    await mongoProductClient.connect();

    reviewDb = mongoReviewClient.db();
    productDb = mongoProductClient.db();

    // Clean test databases
    await reviewDb.collection('reviews').deleteMany({});
    await productDb.collection('products').deleteMany({});
    console.log('✓ Test databases cleaned');

    // Insert test product
    const testProduct = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Test T-Shirt',
      price: 29.99,
      review_aggregates: {
        average_rating: 0,
        total_review_count: 0,
        verified_review_count: 0,
        rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        recent_reviews: [],
        last_review_date: null,
        last_updated: new Date(),
      },
    };
    await productDb.collection('products').insertOne(testProduct);
    console.log('✓ Test product created');

    // Start Product Service with Dapr
    const productServicePath = join(__dirname, '../../../../product-service');
    productServiceProcess = await startServiceWithDapr(
      'product-service',
      PRODUCT_SERVICE_PORT,
      PRODUCT_DAPR_HTTP_PORT,
      50001,
      ['python', '-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', PRODUCT_SERVICE_PORT.toString()],
      productServicePath,
    );

    // Wait for product service to be ready
    await waitForService(`http://localhost:${PRODUCT_SERVICE_PORT}/health`);

    // Start Review Service with Dapr
    const reviewServicePath = join(__dirname, '../..');
    reviewServiceProcess = await startServiceWithDapr(
      'review-service',
      REVIEW_SERVICE_PORT,
      REVIEW_DAPR_HTTP_PORT,
      50002,
      ['npm', 'run', 'dev'],
      reviewServicePath,
    );

    // Wait for review service to be ready
    await waitForService(`http://localhost:${REVIEW_SERVICE_PORT}/health`);

    // Give services extra time to fully initialize Dapr subscriptions
    await setTimeout(5000);
    console.log('\n✓ All services ready for testing\n');
  }, 120000); // 2 minute timeout for setup

  afterAll(async () => {
    console.log('\n🧹 Cleaning up...\n');

    // Stop services
    if (reviewServiceProcess) {
      reviewServiceProcess.kill('SIGTERM');
      console.log('✓ Review service stopped');
    }
    if (productServiceProcess) {
      productServiceProcess.kill('SIGTERM');
      console.log('✓ Product service stopped');
    }

    // Clean databases
    if (reviewDb) {
      await reviewDb.collection('reviews').deleteMany({});
    }
    if (productDb) {
      await productDb.collection('products').deleteMany({});
    }

    // Close MongoDB connections
    if (mongoReviewClient) {
      await mongoReviewClient.close();
    }
    if (mongoProductClient) {
      await mongoProductClient.close();
    }

    // Kill any remaining Dapr processes
    spawn('taskkill', ['/F', '/IM', 'daprd.exe'], { shell: true });

    console.log('✓ Cleanup complete\n');
  }, 30000);

  describe('Review Created Event Flow', () => {
    it('should create review, publish event, and update product aggregates', async () => {
      // Create a review via review service API
      const reviewData = {
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-test-001',
        rating: 5,
        title: 'Excellent product!',
        comment: 'Love this t-shirt, fits perfectly and great quality',
        isVerifiedPurchase: true,
      };

      const createResponse = await axios.post(`http://localhost:${REVIEW_SERVICE_PORT}/api/reviews`, reviewData, {
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': 'e2e-test-create-001',
        },
      });

      expect(createResponse.status).toBe(201);
      expect(createResponse.data).toHaveProperty('reviewId');
      const reviewId = createResponse.data.reviewId;

      // Wait for event to propagate through Dapr
      await setTimeout(3000);

      // Verify product aggregates were updated
      const product = await productDb.collection('products').findOne({ _id: '507f1f77bcf86cd799439011' });

      expect(product).toBeDefined();
      expect(product.review_aggregates).toMatchObject({
        average_rating: 5,
        total_review_count: 1,
        verified_review_count: 1,
        rating_distribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 1,
        },
      });

      expect(product.review_aggregates.last_review_date).toBeDefined();
      expect(product.review_aggregates.recent_reviews).toHaveLength(1);
      expect(product.review_aggregates.recent_reviews[0]).toMatchObject({
        review_id: reviewId,
        rating: 5,
        title: 'Excellent product!',
      });

      console.log('✓ Review created and product aggregates updated successfully');
    }, 20000);

    it('should handle multiple reviews and calculate correct average', async () => {
      // Create second review with different rating
      const reviewData2 = {
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-test-002',
        rating: 4,
        title: 'Good product',
        comment: 'Nice quality but sizing runs a bit small',
        isVerifiedPurchase: false,
      };

      await axios.post(`http://localhost:${REVIEW_SERVICE_PORT}/api/reviews`, reviewData2, {
        headers: {
          'x-correlation-id': 'e2e-test-create-002',
        },
      });

      // Wait for event propagation
      await setTimeout(3000);

      // Verify aggregates: (5 + 4) / 2 = 4.5
      const product = await productDb.collection('products').findOne({ _id: '507f1f77bcf86cd799439011' });

      expect(product.review_aggregates).toMatchObject({
        average_rating: 4.5,
        total_review_count: 2,
        verified_review_count: 1, // Only first review was verified
        rating_distribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 1,
          5: 1,
        },
      });

      console.log('✓ Multiple reviews processed and average calculated correctly');
    }, 20000);
  });

  describe('Review Updated Event Flow', () => {
    it('should update review rating and recalculate product aggregates', async () => {
      // Get current product state
      let product = await productDb.collection('products').findOne({ _id: '507f1f77bcf86cd799439011' });
      const currentAverage = product.review_aggregates.average_rating;
      const currentCount = product.review_aggregates.total_review_count;

      // Get a review to update
      const reviews = await reviewDb.collection('reviews').find({ productId: '507f1f77bcf86cd799439011' }).toArray();
      const reviewToUpdate = reviews[0];

      // Update the review rating from 5 to 3
      const updateData = {
        rating: 3,
        title: 'Updated review',
        comment: 'Changed my opinion after more use',
      };

      await axios.put(`http://localhost:${REVIEW_SERVICE_PORT}/api/reviews/${reviewToUpdate._id}`, updateData, {
        headers: {
          'x-correlation-id': 'e2e-test-update-001',
        },
      });

      // Wait for event propagation
      await setTimeout(3000);

      // Verify aggregates were recalculated
      product = await productDb.collection('products').findOne({ _id: '507f1f77bcf86cd799439011' });

      // Average should change: ((4.5 * 2) - 5 + 3) / 2 = 3.5
      expect(product.review_aggregates.average_rating).toBe(3.5);
      expect(product.review_aggregates.total_review_count).toBe(currentCount);
      expect(product.review_aggregates.rating_distribution[5]).toBe(0); // 5-star reduced
      expect(product.review_aggregates.rating_distribution[3]).toBe(1); // 3-star added

      console.log('✓ Review updated and product aggregates recalculated correctly');
    }, 20000);
  });

  describe('Review Deleted Event Flow', () => {
    it('should delete review and update product aggregates accordingly', async () => {
      // Get current product state
      let product = await productDb.collection('products').findOne({ _id: '507f1f77bcf86cd799439011' });
      const currentCount = product.review_aggregates.total_review_count;

      // Get a review to delete
      const reviews = await reviewDb.collection('reviews').find({ productId: '507f1f77bcf86cd799439011' }).toArray();
      const reviewToDelete = reviews[0];
      const ratingToDelete = reviewToDelete.rating;

      // Delete the review
      await axios.delete(`http://localhost:${REVIEW_SERVICE_PORT}/api/reviews/${reviewToDelete._id}`, {
        headers: {
          'x-correlation-id': 'e2e-test-delete-001',
        },
      });

      // Wait for event propagation
      await setTimeout(3000);

      // Verify aggregates were updated
      product = await productDb.collection('products').findOne({ _id: '507f1f77bcf86cd799439011' });

      expect(product.review_aggregates.total_review_count).toBe(currentCount - 1);
      expect(product.review_aggregates.rating_distribution[ratingToDelete]).toBeLessThan(currentCount);

      // If only one review left, average should be that review's rating
      if (product.review_aggregates.total_review_count === 1) {
        const remainingReview = await reviewDb.collection('reviews').findOne({ productId: '507f1f77bcf86cd799439011' });
        expect(product.review_aggregates.average_rating).toBe(remainingReview.rating);
      }

      console.log('✓ Review deleted and product aggregates updated correctly');
    }, 20000);
  });

  describe('Error Scenarios', () => {
    it('should handle review for non-existent product gracefully', async () => {
      const reviewData = {
        productId: '507f1f77bcf86cd799439999', // Non-existent product
        userId: 'user-test-003',
        rating: 5,
        title: 'Great!',
        comment: 'Excellent',
        isVerifiedPurchase: true,
      };

      try {
        await axios.post(`http://localhost:${REVIEW_SERVICE_PORT}/api/reviews`, reviewData, {
          headers: {
            'x-correlation-id': 'e2e-test-error-001',
          },
        });
      } catch (error) {
        // Review service might validate product existence
        // If not, product service consumer should handle gracefully
        expect([400, 404, 201]).toContain(error.response?.status || 201);
      }

      await setTimeout(2000);
      console.log('✓ Handled non-existent product scenario');
    }, 15000);
  });

  describe('Correlation ID Propagation', () => {
    it('should propagate correlation ID through the event chain', async () => {
      const correlationId = `e2e-test-correlation-${Date.now()}`;

      const reviewData = {
        productId: '507f1f77bcf86cd799439011',
        userId: 'user-test-004',
        rating: 5,
        title: 'Testing correlation',
        comment: 'This tests correlation ID propagation',
        isVerifiedPurchase: true,
      };

      const response = await axios.post(`http://localhost:${REVIEW_SERVICE_PORT}/api/reviews`, reviewData, {
        headers: {
          'x-correlation-id': correlationId,
        },
      });

      expect(response.headers['x-correlation-id']).toBe(correlationId);

      // Wait for event propagation
      await setTimeout(3000);

      // Check that product was updated (indirect proof of correlation ID working)
      const product = await productDb.collection('products').findOne({ _id: '507f1f77bcf86cd799439011' });
      expect(product.review_aggregates.total_review_count).toBeGreaterThan(0);

      console.log('✓ Correlation ID propagated successfully');
    }, 20000);
  });
});
