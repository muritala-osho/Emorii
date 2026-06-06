const rateLimit = require('express-rate-limit');

// ─── Shared Redis store ───────────────────────────────────────────────────────
// Distributes counters across all Render instances so rate limits hold even
// when the service auto-scales. Gracefully falls back to in-memory if Redis
// is unavailable so the app still starts cleanly without it.
// H-6: When Redis is unavailable the rate limiters fall back to per-process
// in-memory counters. In a clustered environment (cluster.js spawns up to 4
// workers) each worker maintains its own counter, so the effective limit is
// `configured_max × worker_count`. To compensate, we divide the per-process
// max by the worker count when operating without shared Redis state, keeping
// the aggregate rate limit correct even during a Redis outage.
const WORKER_COUNT = parseInt(process.env.WEB_CONCURRENCY || '1', 10);

let makeStore = null;
if (process.env.REDIS_URL) {
  try {
    const { RedisStore } = require('rate-limit-redis');
    const Redis = require('ioredis');
    const rl = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy: (times) => (times > 2 ? null : times * 300),
    });
    rl.on('error', () => {}); // suppress unhandled errors — limiter degrades gracefully
    makeStore = (prefix) => new RedisStore({
      sendCommand: (...args) => rl.call(...args),
      prefix: `rl:${prefix}:`,
    });
  } catch (e) {
    console.warn('[RateLimiter] rate-limit-redis unavailable — using in-memory store:', e.message);
  }
}

const store = (prefix) => (makeStore ? { store: makeStore(prefix) } : {});

// Returns the correct per-process max for a given logical window limit.
// With Redis (shared state): use the full configured limit.
// Without Redis (per-process memory): divide by worker count so that the
// aggregate across all workers equals the intended limit.
const perWorkerMax = (max) =>
  makeStore ? max : Math.max(1, Math.ceil(max / WORKER_COUNT));

// ─── Limiters ─────────────────────────────────────────────────────────────────

// Security-sensitive limiters use perWorkerMax so the brute-force limit stays
// correct whether Redis is available (shared counters) or not (per-process).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: perWorkerMax(10),
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  ...store('auth'),
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 15 minutes.'
  }
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: perWorkerMax(5),
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
  ...store('otp'),
  message: {
    success: false,
    message: 'Too many OTP attempts, please try again in 10 minutes.'
  }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: perWorkerMax(5),
  standardHeaders: true,
  legacyHeaders: false,
  ...store('forgot'),
  message: {
    success: false,
    message: 'Too many password reset requests, please try again after 15 minutes.'
  }
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: perWorkerMax(5),
  standardHeaders: true,
  legacyHeaders: false,
  ...store('reset'),
  message: {
    success: false,
    message: 'Too many reset attempts, please try again after 15 minutes.'
  }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: perWorkerMax(30),
  standardHeaders: true,
  legacyHeaders: false,
  ...store('refresh'),
  message: {
    success: false,
    message: 'Too many refresh attempts, please try again after 15 minutes.'
  }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  ...store('admin'),
  message: {
    success: false,
    message: 'Too many admin requests, please try again after 15 minutes.'
  }
});

const adminEmailLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : null) || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
  validate: { trustProxy: false, xForwardedForHeader: false },
  ...store('admin-email'),
  message: {
    success: false,
    message: 'Too many email actions. Please wait 30 minutes before sending more emails to users.'
  }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  ...store('api'),
  skip: (req) => {
    return req.path.startsWith('/socket.io') || req.path.startsWith('/public');
  },
  message: {
    success: false,
    message: 'Too many requests, please slow down.'
  }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  ...store('upload'),
  message: {
    success: false,
    message: 'Upload limit reached. Please wait an hour before uploading more.'
  }
});

const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  ...store('msg'),
  message: {
    success: false,
    message: 'You are sending messages too quickly. Please slow down.'
  }
});

const swipeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : null) || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
  validate: { trustProxy: false, xForwardedForHeader: false },
  ...store('swipe'),
  message: {
    success: false,
    message: 'Swipe limit reached for this hour. Please come back later.'
  }
});

const discoveryLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : null) || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
  validate: { trustProxy: false, xForwardedForHeader: false },
  ...store('discovery'),
  message: {
    success: false,
    message: 'You are loading discovery too frequently. Please wait a moment.'
  }
});

const callTokenLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? req.user._id.toString() : null) || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown',
  validate: { trustProxy: false, xForwardedForHeader: false },
  ...store('call'),
  message: {
    success: false,
    message: 'Too many call requests. Please wait a moment.'
  }
});

const supportTicketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  ...store('support'),
  message: {
    success: false,
    message: 'Too many support tickets submitted. Please try again in an hour.'
  }
});

// Per-user search limiter — prevents brute-force enumeration of user names.
// The general apiLimiter allows 120 req/min across ALL endpoints from one IP,
// which gives an attacker far too many search calls. This tightens the window
// specifically for /api/users/search: 20 searches per minute per authenticated
// user (keyed on userId, not IP, so VPN rotation doesn't help).
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req.user ? req.user._id.toString() : null) ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown',
  validate: { trustProxy: false, xForwardedForHeader: false },
  ...store('search'),
  message: {
    success: false,
    message: 'You are searching too frequently. Please wait a moment before searching again.'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  otpLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  refreshLimiter,
  adminLimiter,
  adminEmailLimiter,
  uploadLimiter,
  messageLimiter,
  swipeLimiter,
  supportTicketLimiter,
  discoveryLimiter,
  callTokenLimiter,
  searchLimiter
};
