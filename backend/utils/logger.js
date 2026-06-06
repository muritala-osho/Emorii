// H-5: `warn` is now always emitted in production so operational warnings
// (Redis circuit-breaker, cache failures, email errors, etc.) are visible.
// L-2: `info` is always emitted for the same reason — security-relevant
// informational events (suspicious login alerts, audit notices) must not be
// silently dropped in production.
// `log` remains dev-only to keep production logs clean from debug noise.

const isProd = process.env.NODE_ENV === 'production';

const logger = {
  log:   (...args) => { if (!isProd) console.log(...args); },
  warn:  (...args) => { console.warn(...args); },   // H-5: always on
  error: (...args) => { console.error(...args); },
  info:  (...args) => { console.info(...args); },   // L-2: always on
};

module.exports = logger;
