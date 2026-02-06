import jwt from 'jsonwebtoken';
import config from '../core/config.js';
import { logger } from '../core/logger.js';
import ErrorResponse from '../core/errors.js';

// Get JWT config from environment variables (no Dapr dependency)
const getJwtConfig = () => {
  return {
    secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER || 'xshopai-auth-service',
    audience: process.env.JWT_AUDIENCE || 'xshopai-services',
  };
};

/**
 * Middleware to verify JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new ErrorResponse('Authorization header missing', 401);
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new ErrorResponse('Invalid authorization header format', 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer' prefix

    if (!token) {
      throw new ErrorResponse('Token missing', 401);
    }

    const jwtCfg = getJwtConfig();
    const decoded = jwt.verify(token, jwtCfg.secret, {
      issuer: jwtCfg.issuer,
      audience: jwtCfg.audience,
    });

    // Add user information to request
    req.user = {
      userId: decoded.userId || decoded.id || decoded.sub,
      username: decoded.username || decoded.email?.split('@')[0],
      email: decoded.email,
      roles: decoded.roles || [],
      isAdmin: (decoded.roles || []).includes('admin') || decoded.isAdmin || false,
      isVerified: decoded.isVerified || false,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    // Log authentication success
    // logger.debug('User authenticated successfully', {
    //   userId: req.user.userId,
    //   username: req.user.username,
    //   correlationId: req.correlationId,
    // });

    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error.message,
      authHeader: req.headers.authorization ? 'present' : 'missing',
      correlationId: req.correlationId,
      ip: req.ip,
    });

    if (error.name === 'JsonWebTokenError') {
      return next(new ErrorResponse('Invalid token', 401));
    }

    if (error.name === 'TokenExpiredError') {
      return next(new ErrorResponse('Token expired', 401));
    }

    if (error.name === 'NotBeforeError') {
      return next(new ErrorResponse('Token not active', 401));
    }

    next(error);
  }
};

/**
 * Optional authentication middleware
 * Sets user if token is valid, but doesn't fail if no token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);

    if (!token) {
      req.user = null;
      return next();
    }

    const jwtCfg = getJwtConfig();
    const decoded = jwt.verify(token, jwtCfg.secret, {
      issuer: jwtCfg.issuer,
      audience: jwtCfg.audience,
    });

    req.user = {
      userId: decoded.userId || decoded.sub,
      username: decoded.username,
      email: decoded.email,
      roles: decoded.roles || [],
      isAdmin: decoded.isAdmin || false,
      isVerified: decoded.isVerified || false,
      iat: decoded.iat,
      exp: decoded.exp,
    };

    next();
  } catch (error) {
    // Token is invalid, but we don't fail the request
    logger.debug('Optional auth failed, continuing without user', {
      error: error.message,
      correlationId: req.correlationId,
    });

    req.user = null;
    next();
  }
};

/**
 * Middleware to check if user is admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Authentication required', 401));
  }

  if (!req.user.isAdmin) {
    logger.warn('Admin access denied', {
      userId: req.user.userId,
      username: req.user.username,
      correlationId: req.correlationId,
      endpoint: req.originalUrl,
    });

    return next(new ErrorResponse('Admin access required', 403));
  }

  next();
};

/**
 * Middleware to check if user has specific role
 * @param {String|Array} requiredRoles - Required role(s)
 * @returns {Function} Middleware function
 */
export const requireRole = (requiredRoles) => {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req, res, next) => {
    if (!req.user) {
      return next(new ErrorResponse('Authentication required', 401));
    }

    const userRoles = req.user.roles || [];
    const hasRole = roles.some((role) => userRoles.includes(role));

    if (!hasRole && !req.user.isAdmin) {
      logger.warn('Role access denied', {
        userId: req.user.userId,
        username: req.user.username,
        userRoles,
        requiredRoles: roles,
        correlationId: req.correlationId,
        endpoint: req.originalUrl,
      });

      return next(new ErrorResponse(`Required role(s): ${roles.join(', ')}`, 403));
    }

    next();
  };
};

/**
 * Middleware to check if user is verified
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const requireVerified = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Authentication required', 401));
  }

  if (!req.user.isVerified && !req.user.isAdmin) {
    logger.warn('Verified user access denied', {
      userId: req.user.userId,
      username: req.user.username,
      isVerified: req.user.isVerified,
      correlationId: req.correlationId,
      endpoint: req.originalUrl,
    });

    return next(new ErrorResponse('Email verification required', 403));
  }

  next();
};

/**
 * Middleware to check resource ownership
 * @param {String} resourceField - Field name to check ownership (e.g., 'userId')
 * @param {String} paramName - Parameter name in req.params (default: 'userId')
 * @returns {Function} Middleware function
 */
export const requireOwnership = (resourceField = 'userId', paramName = 'userId') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(new ErrorResponse('Authentication required', 401));
      }

      // Admin can access any resource
      if (req.user.isAdmin) {
        return next();
      }

      const resourceUserId = req.params[paramName] || req.body[resourceField];

      if (!resourceUserId) {
        return next(new ErrorResponse('Resource identifier missing', 403));
      }

      if (req.user.userId !== resourceUserId) {
        logger.warn('Ownership access denied', {
          userId: req.user.userId,
          resourceUserId,
          resourceField,
          correlationId: req.correlationId,
          endpoint: req.originalUrl,
        });

        return next(new ErrorResponse('You can only access your own resources', 403));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to extract user ID from token for internal services
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const extractUserId = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      if (token) {
        try {
          const jwtCfg = await getJwtConfig();
          const decoded = jwt.verify(token, jwtCfg.secret, {
            issuer: jwtCfg.issuer,
            audience: jwtCfg.audience,
          });
          req.userId = decoded.userId || decoded.sub;
        } catch (error) {
          // Token invalid, but we don't fail - just don't set userId
          logger.debug('Token extraction failed', {
            error: error.message,
            correlationId: req.correlationId,
          });
        }
      }
    }

    // Also check for user ID in headers (for internal service calls)
    if (!req.userId && req.headers['x-user-id']) {
      req.userId = req.headers['x-user-id'];
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware for API key authentication (for internal services)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const verifyApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      return next(new ErrorResponse('API key required', 401));
    }

    // In a real implementation, you would validate the API key against a database
    // For now, we'll use a simple check against environment variable
    const validApiKey = process.env.INTERNAL_API_KEY;

    if (!validApiKey || apiKey !== validApiKey) {
      logger.warn('Invalid API key', {
        apiKey: apiKey.substring(0, 8) + '...',
        correlationId: req.correlationId,
        ip: req.ip,
      });

      return next(new ErrorResponse('Invalid API key', 401));
    }

    // Mark request as internal
    req.isInternal = true;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Alias for verifyToken - main authentication middleware
 */
export const authenticateUser = verifyToken;

export default {
  verifyToken,
  authenticateUser,
  optionalAuth,
  requireAdmin,
  requireRole,
  requireVerified,
  requireOwnership,
  extractUserId,
  verifyApiKey,
};
