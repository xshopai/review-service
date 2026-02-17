import Review from '../models/review.model.js';
import { logger } from '../core/logger.js';
import ErrorResponse from '../core/errors.js';
import eventPublisher from '../events/publisher.js';
import config from '../core/config.js';
import mongoose from 'mongoose';

class ReviewService {
  /**
   * Create a new review
   */
  async createReview(reviewData, user, traceId, spanId) {
    const log = logger.withTraceContext(traceId, spanId);

    // Validate user can create reviews (admin users cannot create reviews)
    this.validateUserCanCreateReview(user, log);

    // Check if user already reviewed this product
    const existingReview = await Review.findOne({
      productId: reviewData.productId,
      userId: user.userId,
    });

    if (existingReview) {
      throw new ErrorResponse('User has already reviewed this product', 409);
    }

    // Validate product exists
    await this.validateProduct(reviewData.productId, traceId, spanId);

    // Validate purchase - either optional (for verified badge) or required
    let isVerifiedPurchase = false;
    if (reviewData.orderReference) {
      isVerifiedPurchase = await this.validatePurchase(
        user.userId,
        reviewData.productId,
        reviewData.orderReference,
        traceId,
        spanId,
      );
    }

    // If purchase is required and user hasn't purchased, reject the review
    if (config.review?.requirePurchase && !isVerifiedPurchase) {
      log.warn('Review rejected - purchase required but not verified', {
        userId: user.userId,
        productId: reviewData.productId,
        orderReference: reviewData.orderReference || 'not provided',
      });
      throw new ErrorResponse(
        'You must purchase this product before writing a review. Please provide a valid order reference.',
        403,
        'PURCHASE_REQUIRED',
      );
    }

    // Determine initial status
    const status = this.determineInitialStatus(isVerifiedPurchase);

    // Create review
    const review = new Review({
      ...reviewData,
      userId: user.userId,
      username: user.username,
      isVerifiedPurchase,
      status,
      createdBy: user.userId,
      updatedBy: user.userId,
      metadata: {
        ...reviewData.metadata,
        source: reviewData.source || 'web',
      },
    });

    const savedReview = await review.save();

    // Publish event via Dapr - Product service will update rating aggregate
    try {
      await eventPublisher.publishReviewCreated(savedReview, traceId, spanId);
      log.info('Review created event published', {
        reviewId: savedReview._id,
        productId: reviewData.productId,
        userId: user.userId,
      });
    } catch (eventError) {
      log.error('Failed to publish review.created event', {
        error: eventError.message,
        reviewId: savedReview._id,
        productId: reviewData.productId,
      });
      // Don't fail the review creation if event publishing fails
      // Event publishing will be retried or handled by reconciliation job
    }

    log.info('Review created successfully', {
      reviewId: savedReview._id,
      productId: reviewData.productId,
      userId: user.userId,
    });

    return savedReview;
  }

  /**
   * Get reviews for a product with filtering and pagination
   */
  async getProductReviews(productId, options = {}, traceId, spanId) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status = 'approved',
      rating,
      verifiedOnly = false,
      withMedia = false,
      search,
      userId,
    } = options;

    // Build filter
    const filter = { productId: new mongoose.Types.ObjectId(productId) };

    if (Array.isArray(status)) {
      filter.status = { $in: status };
    } else {
      filter.status = status;
    }

    if (rating) {
      filter.rating = Array.isArray(rating) ? { $in: rating.map(Number) } : Number(rating);
    }

    if (verifiedOnly) {
      filter.isVerifiedPurchase = true;
    }

    if (withMedia) {
      filter.$or = [
        { images: { $exists: true, $not: { $size: 0 } } },
        { videos: { $exists: true, $not: { $size: 0 } } },
      ];
    }

    if (search) {
      filter.$text = { $search: search };
    }

    if (userId) {
      filter.userId = userId;
    }

    // Build sort
    const sort = {};
    if (sortBy === 'helpfulness') {
      sort['helpfulVotes.helpful'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'rating') {
      sort.rating = sortOrder === 'desc' ? -1 : 1;
      sort['createdAt'] = -1;
    } else {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const skip = (page - 1) * limit;

    // Compute rating aggregates for this product (using all approved reviews, not filtered)
    const aggregateFilter = {
      productId: new mongoose.Types.ObjectId(productId),
      status: 'approved',
    };

    const [reviews, total, ratingAggregates] = await Promise.all([
      Review.find(filter).sort(sort).skip(skip).limit(limit).select('-__v -helpfulVotes.userVotes').lean(),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: aggregateFilter },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
            verifiedCount: {
              $sum: { $cond: ['$isVerifiedPurchase', 1, 0] },
            },
            rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          },
        },
      ]),
    ]);

    // Format rating aggregates
    const agg = ratingAggregates[0] || {};
    const ratingDetails = {
      averageRating: agg.averageRating ? Math.round(agg.averageRating * 10) / 10 : 0,
      totalReviews: agg.totalReviews || 0,
      verifiedReviewCount: agg.verifiedCount || 0,
      ratingDistribution: {
        1: agg.rating1 || 0,
        2: agg.rating2 || 0,
        3: agg.rating3 || 0,
        4: agg.rating4 || 0,
        5: agg.rating5 || 0,
      },
    };

    // Add virtual fields
    const enrichedReviews = reviews.map((review) => ({
      ...review,
      helpfulScore: this.calculateHelpfulScore(review.helpfulVotes),
      totalVotes: review.helpfulVotes.helpful + review.helpfulVotes.notHelpful,
      ageInDays: Math.floor((Date.now() - new Date(review.createdAt)) / (1000 * 60 * 60 * 24)),
    }));

    return {
      reviews: enrichedReviews,
      ratingDetails,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
      filters: {
        productId,
        status,
        rating,
        verifiedOnly,
        withMedia,
        search,
      },
    };
  }

  /**
   * Update a review
   */
  async updateReview(reviewId, userId, updateData, traceId, spanId) {
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new ErrorResponse('Review not found', 404);
    }

    // Check ownership - ensure both are strings for comparison
    if (review.userId.toString() !== userId.toString()) {
      throw new ErrorResponse('You can only update your own reviews', 403);
    }

    // Store previous rating for event
    const previousRating = review.rating;

    // Validate and apply updates
    const allowedFields = ['rating', 'title', 'comment', 'images', 'videos'];
    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        review[field] = updateData[field];
      }
    });

    review.metadata.updatedAt = new Date();

    // Reset status to pending if content changed
    if (updateData.rating !== undefined || updateData.comment !== undefined) {
      review.status = 'pending';
    }

    const updatedReview = await review.save();

    // Publish event
    try {
      await eventPublisher.publishReviewUpdated(updatedReview, previousRating, traceId, spanId);
      const log = logger.withTraceContext(traceId, spanId);
      log.info('Review updated event published', {
        reviewId: updatedReview._id,
        productId: updatedReview.productId,
        previousRating,
        newRating: updatedReview.rating,
      });
    } catch (eventError) {
      const log = logger.withTraceContext(traceId, spanId);
      log.error('Failed to publish review.updated event', {
        error: eventError.message,
        reviewId: updatedReview._id,
      });
    }

    return updatedReview;
  }

  /**
   * Delete a review
   */
  async deleteReview(reviewId, userId, traceId, spanId) {
    const review = await Review.findById(reviewId);
    if (!review) {
      throw new ErrorResponse('Review not found', 404);
    }

    if (review.userId.toString() !== userId.toString()) {
      throw new ErrorResponse('You can only delete your own reviews', 403);
    }

    await Review.findByIdAndDelete(reviewId);

    // Publish event
    try {
      await eventPublisher.publishReviewDeleted(review, traceId, spanId);
      const log = logger.withTraceContext(traceId, spanId);
      log.info('Review deleted event published', {
        reviewId,
        productId: review.productId,
        userId: review.userId,
      });
    } catch (eventError) {
      const log = logger.withTraceContext(traceId, spanId);
      log.error('Failed to publish review.deleted event', {
        error: eventError.message,
        reviewId,
      });
    }

    return true;
  }

  /**
   * Vote on review helpfulness
   */
  async voteOnReview(reviewId, userId, voteType, traceId, spanId) {
    if (!['helpful', 'notHelpful'].includes(voteType)) {
      throw new ErrorResponse('Vote must be either "helpful" or "notHelpful"', 400);
    }

    const review = await Review.findById(reviewId);
    if (!review) {
      throw new ErrorResponse('Review not found', 404);
    }

    if (review.userId === userId) {
      throw new ErrorResponse('You cannot vote on your own review', 403);
    }

    const existingVoteIndex = review.helpfulVotes.userVotes.findIndex((v) => v.userId === userId);

    if (existingVoteIndex >= 0) {
      const oldVote = review.helpfulVotes.userVotes[existingVoteIndex].vote;

      if (oldVote === voteType) {
        // Remove vote if same
        review.helpfulVotes.userVotes.splice(existingVoteIndex, 1);
        review.helpfulVotes[oldVote]--;
      } else {
        // Change vote
        review.helpfulVotes.userVotes[existingVoteIndex].vote = voteType;
        review.helpfulVotes.userVotes[existingVoteIndex].votedAt = new Date();
        review.helpfulVotes[oldVote]--;
        review.helpfulVotes[voteType]++;
      }
    } else {
      // Add new vote
      review.helpfulVotes.userVotes.push({
        userId,
        vote: voteType,
        votedAt: new Date(),
      });
      review.helpfulVotes[voteType]++;
    }

    await review.save();
    return review;
  }

  /**
   * Get user's reviews
   */
  async getUserReviews(userId, options, traceId, spanId) {
    const { page = 1, limit = 10, sort = 'newest', status = null } = options;

    const filter = { userId };
    if (status) {
      filter.status = status;
    }

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      rating: { rating: -1 },
    };

    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort(sortMap[sort] || sortMap.newest)
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);

    return {
      reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get review by ID
   */
  async getReviewById(reviewId, userId = null, traceId, spanId) {
    const review = await Review.findById(reviewId).lean();
    if (!review) {
      throw new ErrorResponse('Review not found', 404);
    }

    const enrichedReview = {
      ...review,
      helpfulScore: this.calculateHelpfulScore(review.helpfulVotes),
      totalVotes: review.helpfulVotes.helpful + review.helpfulVotes.notHelpful,
      ageInDays: Math.floor((Date.now() - new Date(review.createdAt)) / (1000 * 60 * 60 * 24)),
    };

    if (userId) {
      const userVote = review.helpfulVotes.userVotes.find((v) => v.userId === userId);
      enrichedReview.userVote = userVote ? userVote.vote : null;
      enrichedReview.isOwnReview = review.userId === userId;
    }

    return enrichedReview;
  }

  /**
   * Calculate helpful score percentage
   */
  calculateHelpfulScore(helpfulVotes) {
    const total = helpfulVotes.helpful + helpfulVotes.notHelpful;
    return total > 0 ? Math.round((helpfulVotes.helpful / total) * 100) : 0;
  }

  /**
   * Determine initial review status
   */
  determineInitialStatus(isVerifiedPurchase) {
    if (config.review?.autoApproveVerified && isVerifiedPurchase) {
      return 'approved';
    }
    return config.review?.moderationRequired ? 'pending' : 'approved';
  }

  /**
   * Validate product exists via Dapr
   */
  async validateProduct(productId, traceId, spanId) {
    // Service invocation only works with Dapr provider
    if (!eventPublisher.client?.invoker) {
      const log = logger.withTraceContext(traceId, spanId);
      log.warn('Dapr client not available for product validation, skipping check', {
        productId,
      });
      return true; // Allow review creation when Dapr is not available
    }

    try {
      const traceparent = `00-${traceId}-${spanId}-01`;
      const response = await eventPublisher.client.invoker.invoke(
        'product-service',
        `api/products/internal/${productId}/exists`,
        'GET',
        null,
        { traceparent: traceparent },
      );

      if (!response.exists) {
        throw new ErrorResponse('Product not found', 404);
      }
      return true;
    } catch (error) {
      if (error.message?.includes('404') || error.message?.includes('not found')) {
        throw new ErrorResponse('Product not found', 404);
      }
      const log = logger.withTraceContext(traceId, spanId);
      log.error('Error validating product:', error);
      return true; // Don't fail review creation if service is down
    }
  }

  /**
   * Validate purchase via Dapr
   */
  async validatePurchase(userId, productId, orderReference, traceId, spanId) {
    // Service invocation only works with Dapr provider
    if (!eventPublisher.client?.invoker) {
      const log = logger.withTraceContext(traceId, spanId);
      log.warn('Dapr client not available for purchase validation, skipping check', {
        userId,
        productId,
        orderReference,
      });
      return false; // Cannot verify purchase without Dapr
    }

    try {
      const traceparent = `00-${traceId}-${spanId}-01`;
      const response = await eventPublisher.client.invoker.invoke(
        'order-service',
        'api/v1/internal/orders/validate-purchase',
        'POST',
        { userId, productId, orderReference },
        { traceparent: traceparent },
      );
      return response.isValid || false;
    } catch (error) {
      const log = logger.withTraceContext(traceId, spanId);
      log.error('Error validating purchase:', error);
      return false;
    }
  }

  /**
   * Get internal statistics for admin
   */
  async getInternalStats(traceId, spanId) {
    const [totalReviews, pendingReviews, approvedReviews] = await Promise.all([
      Review.countDocuments({}),
      Review.countDocuments({ status: 'pending' }),
      Review.countDocuments({ status: 'approved' }),
    ]);

    const avgRatingResult = await Review.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, averageRating: { $avg: '$rating' } } },
    ]);

    const averageRating = avgRatingResult[0]?.averageRating
      ? Math.round(avgRatingResult[0].averageRating * 10) / 10
      : 0;

    // Calculate growth
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const last60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [recentReviews, previousReviews] = await Promise.all([
      Review.countDocuments({ createdAt: { $gte: last30Days, $lt: now } }),
      Review.countDocuments({ createdAt: { $gte: last60Days, $lt: last30Days } }),
    ]);

    let growth = 0;
    if (previousReviews > 0) {
      growth = Math.round(((recentReviews - previousReviews) / previousReviews) * 100 * 10) / 10;
    } else if (recentReviews > 0) {
      growth = 100;
    }

    return {
      total: totalReviews,
      pending: pendingReviews,
      approved: approvedReviews,
      averageRating,
      growth,
    };
  }

  /**
   * Get all reviews for admin with filtering
   */
  async getAllReviewsForAdmin(options, traceId, spanId) {
    const { status, rating, search, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = options;

    const filter = {};
    if (status) filter.status = status;
    if (rating) filter.rating = parseInt(rating);
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { comment: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [reviews, total] = await Promise.all([
      Review.find(filter).sort(sort).skip(skip).limit(limit).select('-__v -helpfulVotes.userVotes').lean(),
      Review.countDocuments(filter),
    ]);

    return {
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Bulk delete reviews (admin only)
   */
  async bulkDeleteReviews(reviewIds, user, traceId, spanId) {
    const result = await Review.deleteMany({
      _id: { $in: reviewIds },
    });

    return {
      deletedCount: result.deletedCount,
    };
  }

  /**
   * Handle product deletion
   */
  async handleProductDeletion(productId, deleteReviews = true, traceId, spanId) {
    if (deleteReviews) {
      const deleteResult = await Review.deleteMany({ productId });
      return {
        action: 'deleted',
        count: deleteResult.deletedCount,
      };
    } else {
      const updateResult = await Review.updateMany(
        { productId },
        { $set: { status: 'hidden', updatedAt: new Date() } },
      );
      return {
        action: 'soft_deleted',
        count: updateResult.modifiedCount,
      };
    }
  }

  /**
   * Validate that user can create reviews
   * - Admin users cannot create reviews (conflict of interest)
   * - User must have a non-admin role (customer role implied)
   * @param {Object} user - User object from JWT
   * @param {Object} log - Logger with trace context
   * @throws {ErrorResponse} If user is not allowed to create reviews
   */
  validateUserCanCreateReview(user, log) {
    // Check if user is admin - admins cannot create reviews
    const roles = user.roles || [];
    const isAdmin = roles.includes('admin') || user.isAdmin;

    if (isAdmin) {
      log.warn('Admin user attempted to create review', {
        userId: user.userId,
        roles: roles,
      });
      throw new ErrorResponse(
        'Administrators cannot create product reviews to avoid conflict of interest',
        403,
        'ADMIN_CANNOT_REVIEW',
      );
    }

    // Check if user is active (if status is provided in JWT)
    if (user.isActive === false) {
      log.warn('Inactive user attempted to create review', {
        userId: user.userId,
      });
      throw new ErrorResponse('Your account is not active. Please contact support.', 403, 'USER_INACTIVE');
    }

    return true;
  }

  /**
   * Admin: Approve a review
   * @param {String} reviewId - Review ID
   * @param {Object} adminUser - Admin user object
   * @param {String} traceId - Trace ID
   * @param {String} spanId - Span ID
   */
  async approveReview(reviewId, adminUser, traceId, spanId) {
    const log = logger.withTraceContext(traceId, spanId);

    const review = await Review.findById(reviewId);
    if (!review) {
      throw new ErrorResponse('Review not found', 404);
    }

    if (review.status === 'approved') {
      throw new ErrorResponse('Review is already approved', 400);
    }

    review.status = 'approved';
    review.updatedBy = adminUser.userId;
    review.metadata = {
      ...review.metadata,
      moderatedAt: new Date(),
      moderatedBy: adminUser.userId,
    };

    const updatedReview = await review.save();

    // Publish event for approved review
    try {
      await eventPublisher.publishReviewApproved(updatedReview, traceId, spanId);
      log.info('Review approved and event published', {
        reviewId: updatedReview._id,
        productId: updatedReview.productId,
        moderatedBy: adminUser.userId,
      });
    } catch (eventError) {
      log.error('Failed to publish review.approved event', {
        error: eventError.message,
        reviewId: updatedReview._id,
      });
    }

    return updatedReview;
  }

  /**
   * Admin: Reject a review
   * @param {String} reviewId - Review ID
   * @param {Object} adminUser - Admin user object
   * @param {String} reason - Rejection reason
   * @param {String} traceId - Trace ID
   * @param {String} spanId - Span ID
   */
  async rejectReview(reviewId, adminUser, reason, traceId, spanId) {
    const log = logger.withTraceContext(traceId, spanId);

    const review = await Review.findById(reviewId);
    if (!review) {
      throw new ErrorResponse('Review not found', 404);
    }

    if (review.status === 'rejected') {
      throw new ErrorResponse('Review is already rejected', 400);
    }

    review.status = 'rejected';
    review.updatedBy = adminUser.userId;
    review.metadata = {
      ...review.metadata,
      moderatedAt: new Date(),
      moderatedBy: adminUser.userId,
      rejectionReason: reason,
    };

    const updatedReview = await review.save();

    log.info('Review rejected', {
      reviewId: updatedReview._id,
      productId: updatedReview.productId,
      moderatedBy: adminUser.userId,
      reason: reason,
    });

    return updatedReview;
  }

  /**
   * Admin: Hide a review (soft delete)
   * @param {String} reviewId - Review ID
   * @param {Object} adminUser - Admin user object
   * @param {String} reason - Hide reason
   * @param {String} traceId - Trace ID
   * @param {String} spanId - Span ID
   */
  async hideReview(reviewId, adminUser, reason, traceId, spanId) {
    const log = logger.withTraceContext(traceId, spanId);

    const review = await Review.findById(reviewId);
    if (!review) {
      throw new ErrorResponse('Review not found', 404);
    }

    if (review.status === 'hidden') {
      throw new ErrorResponse('Review is already hidden', 400);
    }

    review.status = 'hidden';
    review.updatedBy = adminUser.userId;
    review.metadata = {
      ...review.metadata,
      hiddenAt: new Date(),
      hiddenBy: adminUser.userId,
      hideReason: reason,
    };

    const updatedReview = await review.save();

    log.info('Review hidden', {
      reviewId: updatedReview._id,
      productId: updatedReview.productId,
      hiddenBy: adminUser.userId,
      reason: reason,
    });

    return updatedReview;
  }

  /**
   * Admin: Bulk moderate reviews
   * @param {Array} reviewIds - Array of review IDs
   * @param {String} action - Action to perform (approve, reject, hide)
   * @param {Object} adminUser - Admin user object
   * @param {String} reason - Reason for moderation (required for reject/hide)
   * @param {String} traceId - Trace ID
   * @param {String} spanId - Span ID
   */
  async bulkModerateReviews(reviewIds, action, adminUser, reason, traceId, spanId) {
    const log = logger.withTraceContext(traceId, spanId);

    if (!['approve', 'reject', 'hide'].includes(action)) {
      throw new ErrorResponse('Invalid moderation action. Must be: approve, reject, or hide', 400);
    }

    if ((action === 'reject' || action === 'hide') && !reason) {
      throw new ErrorResponse(`Reason is required for ${action} action`, 400);
    }

    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      hide: 'hidden',
    };

    const updateData = {
      status: statusMap[action],
      updatedBy: adminUser.userId,
      'metadata.moderatedAt': new Date(),
      'metadata.moderatedBy': adminUser.userId,
    };

    if (reason) {
      updateData[action === 'reject' ? 'metadata.rejectionReason' : 'metadata.hideReason'] = reason;
    }

    const result = await Review.updateMany({ _id: { $in: reviewIds } }, { $set: updateData });

    log.info('Bulk moderation completed', {
      action: action,
      reviewIds: reviewIds,
      modifiedCount: result.modifiedCount,
      moderatedBy: adminUser.userId,
    });

    return {
      action: action,
      modifiedCount: result.modifiedCount,
      reviewIds: reviewIds,
    };
  }
}

export default new ReviewService();
