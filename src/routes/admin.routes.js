import express from 'express';
import {
  getStats,
  getAllReviews,
  approveReview,
  rejectReview,
  hideReview,
  bulkModerateReviews,
} from '../controllers/review.controller.js';
import { authenticateUser, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

// Admin routes (require admin role)
router.get('/reviews/all', authenticateUser, requireRole(['admin']), getAllReviews);
router.get('/reviews/stats', authenticateUser, requireRole(['admin']), getStats);

// Admin moderation routes
router.post('/reviews/:reviewId/approve', authenticateUser, requireRole(['admin']), approveReview);
router.post('/reviews/:reviewId/reject', authenticateUser, requireRole(['admin']), rejectReview);
router.post('/reviews/:reviewId/hide', authenticateUser, requireRole(['admin']), hideReview);
router.post('/reviews/bulk-moderate', authenticateUser, requireRole(['admin']), bulkModerateReviews);

export default router;
