const logger = require('./logger');
const Redis = require('ioredis');

let client = null;
let isConnected = false;
let circuitOpen = false;
let circuitOpenedAt = null;
const CIRCUIT_RESET_MS = 30_000;

function getClient() {
  if (client) return client;

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.log('[Redis] REDIS_URL not set — caching disabled');
    return null;
  }

  try {
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 500, 2000);
      },
    });

    client.on('connect', () => {
      isConnected = true;
      circuitOpen = false;
      circuitOpenedAt = null;
      logger.log('[Redis] Connected');
    });

    client.on('error', (err) => {
      isConnected = false;
      if (!circuitOpen) {
        circuitOpen = true;
        circuitOpenedAt = Date.now();
        logger.warn('[Redis] Circuit opened after error:', err.message);
      }
    });

    client.on('close', () => {
      isConnected = false;
    });

    client.connect().catch(() => {});
  } catch (err) {
    logger.warn('[Redis] Failed to initialize:', err.message);
    client = null;
  }

  return client;
}

function isHealthy() {
  if (!process.env.REDIS_URL) return false;
  if (circuitOpen) {
    if (Date.now() - circuitOpenedAt > CIRCUIT_RESET_MS) {
      circuitOpen = false;
      circuitOpenedAt = null;
      logger.log('[Redis] Circuit reset — retrying');
    } else {
      return false;
    }
  }
  return isConnected;
}

async function ping() {
  try {
    const c = getClient();
    if (!c) return false;
    const result = await c.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

async function get(key) {
  try {
    if (!isHealthy()) return null;
    const c = getClient();
    if (!c) return null;
    const val = await c.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

async function set(key, value, ttlSeconds = 60) {
  try {
    if (!isHealthy()) return;
    const c = getClient();
    if (!c) return;
    await c.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    // M-5: Log instead of silently swallowing — a failed set can cause stale
    // data to be served or security state (e.g. revocation flags) to go missing.
    logger.warn('[Redis] set failed:', err.message);
  }
}

async function del(key) {
  try {
    if (!isHealthy()) return;
    const c = getClient();
    if (!c) return;
    await c.del(key);
  } catch (err) {
    logger.warn('[Redis] del failed:', err.message);
  }
}

async function incr(key) {
  try {
    if (!isHealthy()) return null;
    const c = getClient();
    if (!c) return null;
    return await c.incr(key);
  } catch (err) {
    logger.warn('[Redis] incr failed:', err.message);
    return null;
  }
}

async function expire(key, ttlSeconds) {
  try {
    if (!isHealthy()) return;
    const c = getClient();
    if (!c) return;
    await c.expire(key, ttlSeconds);
  } catch (err) {
    logger.warn('[Redis] expire failed:', err.message);
  }
}

async function delPattern(pattern) {
  // M-6: SCAN is non-blocking but not atomic — keys written between iterations
  // may be missed. For discovery caches this is acceptable; the entry will
  // naturally expire on its TTL. For strict invalidation, use versioned keys
  // (increment a namespace counter) rather than pattern deletes.
  try {
    if (!isHealthy()) return;
    const c = getClient();
    if (!c) return;
    let cursor = '0';
    const batchSize = 100;
    do {
      const [nextCursor, keys] = await c.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
      cursor = nextCursor;
      if (keys.length > 0) {
        await c.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn('[Redis] delPattern failed:', err.message);
  }
}

module.exports = { getClient, get, set, del, incr, expire, delPattern, isHealthy, ping };
