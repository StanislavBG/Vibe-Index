import rateLimit from 'express-rate-limit';

// General API rate limit
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict limit for submission/write operations
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests, please try again later.' },
});

// A2A endpoint rate limit (more generous for agents)
export const a2aLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'A2A rate limit exceeded. Check your agent tier for higher limits.' },
});

// Auth endpoints (prevent brute force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts.' },
});

// Feedback submission limit
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 feedback submissions per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Feedback submission limit reached. Try again later.' },
});
