import express from 'express';
import {
  getProductReviews,
  getReviewById,
  createReview,
  updateReview,
  deleteReview,
  voteOnReview,
  getUserReviews,
} from '../controllers/review.controller.js';
import { authenticateUser, optionalAuth } from '../middleware/auth.middleware.js';
import { createReviewLimiter, voteReviewLimiter, viewReviewLimiter } from '../middleware/rateLimiter.middleware.js';
import { sanitizeReviewInput } from '../middleware/sanitize.middleware.js';

const router = express.Router();

// Public routes (with optional authentication for personalization)
router.get('/product/:productId', viewReviewLimiter, optionalAuth, getProductReviews);
router.get('/:reviewId', viewReviewLimiter, optionalAuth, getReviewById);

// Protected routes (rate limit first by IP, then authenticate for userId-based checks)
router.post('/', createReviewLimiter, authenticateUser, sanitizeReviewInput, createReview);
router.put('/:reviewId', createReviewLimiter, authenticateUser, sanitizeReviewInput, updateReview);
router.delete('/:reviewId', authenticateUser, deleteReview);
router.post('/:reviewId/vote', voteReviewLimiter, authenticateUser, voteOnReview);
router.get('/user/my-reviews', viewReviewLimiter, authenticateUser, getUserReviews);

export default router;
