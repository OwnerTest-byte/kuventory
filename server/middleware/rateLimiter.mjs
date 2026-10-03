/**
 * Rate Limiting Middleware
 * Protects endpoints against brute-force attacks and volumetric DoS.
 */
import rateLimit from 'express-rate-limit';

/**
 * Standard rate limiter applied to all general /api endpoints
 * Allows 100 requests per 15-minute window per IP.
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

/**
 * Strict rate limiter applied to authentication / login endpoints
 * Allows at most 5 attempts per 15-minute window per IP to prevent brute-force attacks.
 */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    error: 'Too many login attempts from this IP. Account access throttled for 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  }
});
