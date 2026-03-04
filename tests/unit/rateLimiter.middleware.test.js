import { jest } from '@jest/globals';
import { createReviewLimiter, voteReviewLimiter, viewReviewLimiter } from '../../src/middleware/rateLimiter.middleware.js';

describe('Rate Limiter Middleware', () => {
  describe('createReviewLimiter', () => {
    it('should be a function (middleware)', () => {
      expect(typeof createReviewLimiter).toBe('function');
    });
  });

  describe('voteReviewLimiter', () => {
    it('should be a function (middleware)', () => {
      expect(typeof voteReviewLimiter).toBe('function');
    });
  });

  describe('viewReviewLimiter', () => {
    it('should be a function (middleware)', () => {
      expect(typeof viewReviewLimiter).toBe('function');
    });
  });

  describe('Rate limiter behavior', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        ip: '127.0.0.1',
        user: { userId: 'user123' },
        method: 'GET',
        url: '/test',
        headers: {},
        app: {
          get: jest.fn().mockReturnValue(false),
        },
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        getHeader: jest.fn(),
      };
      next = jest.fn();
    });

    it('should allow first request through createReviewLimiter', async () => {
      await new Promise((resolve) => {
        createReviewLimiter(req, res, (err) => {
          next(err);
          resolve();
        });
      });
      expect(next).toHaveBeenCalled();
    });

    it('should allow first request through voteReviewLimiter', async () => {
      await new Promise((resolve) => {
        voteReviewLimiter(req, res, (err) => {
          next(err);
          resolve();
        });
      });
      expect(next).toHaveBeenCalled();
    });

    it('should allow first request through viewReviewLimiter', async () => {
      await new Promise((resolve) => {
        viewReviewLimiter(req, res, (err) => {
          next(err);
          resolve();
        });
      });
      expect(next).toHaveBeenCalled();
    });
  });
});
