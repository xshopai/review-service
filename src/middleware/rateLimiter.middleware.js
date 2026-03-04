import rateLimit, { MemoryStore } from 'express-rate-limit';

/**
 * Rate limiting middleware for review endpoints
 * Uses in-memory store by default; can be swapped for Redis store in production
 */

/**
 * Rate limiter for creating reviews
 * 5 requests per 15 minutes per user
 */
export const createReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MemoryStore(),
  keyGenerator: (req) => req.user?.userId || req.ip,
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many reviews created. Please try again later.',
        correlationId: req.correlationId,
      },
    });
  },
});

/**
 * Rate limiter for voting on reviews
 * 20 requests per 15 minutes per user
 */
export const voteReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MemoryStore(),
  keyGenerator: (req) => req.user?.userId || req.ip,
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many votes submitted. Please try again later.',
        correlationId: req.correlationId,
      },
    });
  },
});

/**
 * Rate limiter for viewing reviews
 * 100 requests per 15 minutes per IP
 */
export const viewReviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MemoryStore(),
  keyGenerator: (req) => req.ip,
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        correlationId: req.correlationId,
      },
    });
  },
});
