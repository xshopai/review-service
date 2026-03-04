import xss from 'xss';

// Configure xss with strict options — strip all HTML tags
const xssOptions = {
  whiteList: {},
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

/**
 * Sanitize a single string value using xss library
 * @param {string} value - The string to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  return xss(value, xssOptions);
}

/**
 * Express middleware that sanitizes review input fields (title, comment, content)
 * in the request body to prevent XSS attacks
 */
export const sanitizeReviewInput = (req, res, next) => {
  if (!req.body) return next();

  if (typeof req.body.title === 'string') {
    req.body.title = sanitizeString(req.body.title);
  }
  if (typeof req.body.comment === 'string') {
    req.body.comment = sanitizeString(req.body.comment);
  }
  if (typeof req.body.content === 'string') {
    req.body.content = sanitizeString(req.body.content);
  }

  next();
};
