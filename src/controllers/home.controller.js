import config from '../core/config.js';

/**
 * Service information endpoint
 * @route GET / or GET /info
 */
export const info = (req, res) => {
  res.json({
    service: config.serviceName,
    version: config.serviceVersion,
    description: 'xshopai Review and Rating Service',
    environment: config.env,
    timestamp: new Date().toISOString(),
    endpoints: {
      reviews: '/api/reviews',
      health: '/health',
      readiness: '/health/ready',
      liveness: '/health/live',
      metrics: '/metrics',
    },
    traceId: req.traceId,
    spanId: req.spanId,
  });
};

export default {
  info,
};
