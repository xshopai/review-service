import reviewService from '../services/review.service.js';
import { logger } from '../core/logger.js';
import { asyncHandler } from '../middleware/asyncHandler.middleware.js';

/**
 * Create a new review
 */
export const createReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.body, req.user, req.traceId, req.spanId);
  res.status(201).json({
    success: true,
    message: 'Review created successfully',
    data: { review },
  });
});

/**
 * Get reviews for a specific product
 */
export const getProductReviews = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const queryOptions = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 10,
    sort: req.query.sort || 'newest',
    rating: req.query.rating ? parseInt(req.query.rating) : null,
    verified: req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : null,
    search: req.query.search || null,
  };

  const result = await reviewService.getProductReviews(productId, queryOptions, req.traceId, req.spanId);

  res.status(200).json({
    success: true,
    message: 'Reviews retrieved successfully',
    data: result,
  });
});

/**
 * Get a specific review by ID
 */
export const getReviewById = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user?.userId || null;
  const review = await reviewService.getReviewById(reviewId, userId, req.traceId, req.spanId);

  res.status(200).json({
    success: true,
    message: 'Review retrieved successfully',
    data: { review },
  });
});

/**
 * Update a review
 */
export const updateReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const review = await reviewService.updateReview(reviewId, req.user.userId, req.body, req.traceId, req.spanId);
  res.status(200).json({
    success: true,
    message: 'Review updated successfully',
    data: { review },
  });
});

/**
 * Delete a review
 */
export const deleteReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  await reviewService.deleteReview(reviewId, req.user.userId, req.traceId, req.spanId);
  res.status(200).json({
    success: true,
    message: 'Review deleted successfully',
  });
});

/**
 * Vote on review helpfulness
 */
export const voteOnReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { voteType } = req.body;
  const result = await reviewService.voteOnReview(reviewId, req.user.userId, voteType, req.traceId, req.spanId);

  res.status(200).json({
    success: true,
    message: 'Vote recorded successfully',
    data: result,
  });
});

/**
 * Get user's own reviews
 */
export const getUserReviews = asyncHandler(async (req, res) => {
  const queryOptions = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 10,
    sort: req.query.sort || 'newest',
    status: req.query.status || null,
  };

  const result = await reviewService.getUserReviews(req.user.userId, queryOptions, req.traceId, req.spanId);

  res.status(200).json({
    success: true,
    message: 'User reviews retrieved successfully',
    data: result,
  });
});

/**
 * Get internal review stats (admin only)
 */
export const getStats = asyncHandler(async (req, res) => {
  const stats = await reviewService.getInternalStats(req.traceId, req.spanId);

  res.status(200).json({
    success: true,
    message: 'Internal stats retrieved',
    data: stats,
  });
});

/**
 * Get all reviews (admin only)
 */
export const getAllReviews = asyncHandler(async (req, res) => {
  const { status, rating, search, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const reviews = await reviewService.getAllReviewsForAdmin(
    {
      status,
      rating: rating ? parseInt(rating) : undefined,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
    },
    req.traceId,
    req.spanId,
  );

  res.status(200).json({
    success: true,
    data: reviews.data,
    pagination: reviews.pagination,
  });
});

/**
 * Admin: Approve a review
 */
export const approveReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const review = await reviewService.approveReview(reviewId, req.user, req.traceId, req.spanId);
  res.status(200).json({
    success: true,
    message: 'Review approved successfully',
    data: { review },
  });
});

/**
 * Admin: Reject a review
 */
export const rejectReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: 'Rejection reason is required',
    });
  }

  const review = await reviewService.rejectReview(reviewId, req.user, reason, req.traceId, req.spanId);
  res.status(200).json({
    success: true,
    message: 'Review rejected successfully',
    data: { review },
  });
});

/**
 * Admin: Hide a review
 */
export const hideReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({
      success: false,
      message: 'Hide reason is required',
    });
  }

  const review = await reviewService.hideReview(reviewId, req.user, reason, req.traceId, req.spanId);
  res.status(200).json({
    success: true,
    message: 'Review hidden successfully',
    data: { review },
  });
});

/**
 * Admin: Bulk moderate reviews
 */
export const bulkModerateReviews = asyncHandler(async (req, res) => {
  const { reviewIds, action, reason } = req.body;

  if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'reviewIds array is required',
    });
  }

  if (!action || !['approve', 'reject', 'hide'].includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'action must be one of: approve, reject, hide',
    });
  }

  const result = await reviewService.bulkModerateReviews(reviewIds, action, req.user, reason, req.traceId, req.spanId);

  res.status(200).json({
    success: true,
    message: `Successfully ${action}d ${result.modifiedCount} reviews`,
    data: result,
  });
});
