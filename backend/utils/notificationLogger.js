const NotificationLog = require('../models/NotificationLog');
const User = require('../models/User');
const logger = require('./logger');

const emailToUserCache = new Map();
const tokenToUserCache = new Map();
const CACHE_TTL_MS  = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 2_000; // ~200 bytes/entry × 2000 ≈ 400 KB ceiling per cache

const cached = (map, key) => {
  const entry = map.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
  return undefined;
};
const setCache = (map, key, value) => {
  // Evict oldest entry when the map is full (insertion-order LRU approximation).
  if (map.size >= CACHE_MAX_SIZE) map.delete(map.keys().next().value);
  map.set(key, { ts: Date.now(), value });
};

async function resolveUserIdByEmail(email) {
  if (!email) return null;
  const hit = cached(emailToUserCache, email);
  if (hit !== undefined) return hit;
  try {
    const user = await User.findOne({ email }).select('_id').lean();
    const id = user?._id || null;
    setCache(emailToUserCache, email, id);
    return id;
  } catch (err) {
    return null;
  }
}

async function resolveUserIdByPushToken(token) {
  if (!token) return null;
  const hit = cached(tokenToUserCache, token);
  if (hit !== undefined) return hit;
  try {
    const user = await User.findOne({ pushToken: token }).select('_id').lean();
    const id = user?._id || null;
    setCache(tokenToUserCache, token, id);
    return id;
  } catch (err) {
    return null;
  }
}

const stripHtml = (html) => {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
};

async function logEmail({ to, subject, html, userId, type, status, providerId, errorMessage, meta }) {
  try {
    const recipient = userId || (await resolveUserIdByEmail(to));
    await NotificationLog.create({
      recipient: recipient || undefined,
      recipientEmail: to || null,
      channel: 'email',
      type: type || 'system',
      subject: subject || '',
      body: stripHtml(html),
      status: status || 'sent',
      providerId: providerId || null,
      errorMessage: errorMessage || null,
      meta: meta || {},
    });
  } catch (err) {
    logger.error('[NotificationLog] Failed to log email:', err?.message);
  }
}

async function logPush({ pushToken, title, body, userId, type, status, providerId, errorMessage, data, meta }) {
  try {
    const recipient = userId || (await resolveUserIdByPushToken(pushToken));
    const tail = pushToken ? String(pushToken).slice(-8) : null;
    await NotificationLog.create({
      recipient: recipient || undefined,
      recipientTokenTail: tail,
      channel: 'push',
      type: type || (data && data.type) || 'system',
      subject: title || '',
      body: body || '',
      status: status || 'sent',
      providerId: providerId || null,
      errorMessage: errorMessage || null,
      meta: meta || (data ? { data } : {}),
    });
  } catch (err) {
    logger.error('[NotificationLog] Failed to log push:', err?.message);
  }
}

module.exports = { logEmail, logPush };
