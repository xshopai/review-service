import { jest } from '@jest/globals';
import { sanitizeString, sanitizeReviewInput } from '../../src/middleware/sanitize.middleware.js';

describe('Sanitize Middleware', () => {
  describe('sanitizeString', () => {
    it('should strip script tags from input', () => {
      const input = '<script>alert("xss")</script>Hello';
      expect(sanitizeString(input)).toBe('Hello');
    });

    it('should strip HTML tags from input', () => {
      const input = '<b>Bold</b> and <i>italic</i>';
      expect(sanitizeString(input)).toBe('Bold and italic');
    });

    it('should handle plain text without modification', () => {
      const input = 'This is a normal review text';
      expect(sanitizeString(input)).toBe('This is a normal review text');
    });

    it('should return non-string values as-is', () => {
      expect(sanitizeString(123)).toBe(123);
      expect(sanitizeString(null)).toBe(null);
      expect(sanitizeString(undefined)).toBe(undefined);
    });

    it('should strip event handler attributes', () => {
      const input = '<img onerror="alert(1)" src="x">test';
      const result = sanitizeString(input);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('should strip style tags', () => {
      const input = '<style>body{display:none}</style>Review content';
      expect(sanitizeString(input)).toBe('Review content');
    });

    it('should handle empty string', () => {
      expect(sanitizeString('')).toBe('');
    });
  });

  describe('sanitizeReviewInput middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = { body: {} };
      res = {};
      next = jest.fn();
    });

    it('should sanitize title field', () => {
      req.body.title = '<script>alert("xss")</script>Great product';
      sanitizeReviewInput(req, res, next);
      expect(req.body.title).toBe('Great product');
      expect(next).toHaveBeenCalled();
    });

    it('should sanitize comment field', () => {
      req.body.comment = '<b>Nice</b> product with <script>evil()</script> quality';
      sanitizeReviewInput(req, res, next);
      expect(req.body.comment).toBe('Nice product with  quality');
      expect(next).toHaveBeenCalled();
    });

    it('should sanitize content field', () => {
      req.body.content = '<img src=x onerror=alert(1)>Good item';
      sanitizeReviewInput(req, res, next);
      expect(req.body.content).not.toContain('onerror');
      expect(next).toHaveBeenCalled();
    });

    it('should not modify non-string fields', () => {
      req.body.rating = 5;
      req.body.productId = '507f1f77bcf86cd799439013';
      sanitizeReviewInput(req, res, next);
      expect(req.body.rating).toBe(5);
      expect(req.body.productId).toBe('507f1f77bcf86cd799439013');
      expect(next).toHaveBeenCalled();
    });

    it('should call next when body is missing', () => {
      req.body = undefined;
      sanitizeReviewInput(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should handle body with no title/comment/content fields', () => {
      req.body = { rating: 4 };
      sanitizeReviewInput(req, res, next);
      expect(req.body.rating).toBe(4);
      expect(next).toHaveBeenCalled();
    });
  });
});
