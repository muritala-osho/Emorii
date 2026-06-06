'use strict';

const logger = require('./logger');

// ── In-memory LRU translation cache ─────────────────────────────────────────
// Keyed by djb2(text + targetCode). Max 500 entries, 24-hour TTL.
// Intentionally kept in-memory (cheap to refetch; no persistence needed).
const _cache = new Map();
const CACHE_MAX = 500;
const CACHE_TTL = 24 * 60 * 60 * 1000;

function _hashKey(text, targetCode) {
  let h = 5381;
  const s = text + '\x00' + targetCode;
  for (let i = 0; i < s.length; i++) h = Math.imul((h << 5) + h, 1) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function _cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() > e.x) { _cache.delete(key); return null; }
  // Move to end (most-recently-used)
  _cache.delete(key);
  _cache.set(key, e);
  return e.v;
}

function _cacheSet(key, value) {
  if (_cache.size >= CACHE_MAX) {
    _cache.delete(_cache.keys().next().value); // evict LRU (first/oldest entry)
  }
  _cache.set(key, { v: value, x: Date.now() + CACHE_TTL });
}

const LIBRE_INSTANCES = [
  'https://translate.fedilab.app',
  'https://libretranslate.de',
  'https://translate.terraprint.co',
];

/**
 * Translate `text` to `targetCode` (ISO 639-1, e.g. 'en', 'fr', 'yo').
 * Also detects the source language from the Google Translate response.
 *
 * Strategy (same 3-tier fallback as the interactive endpoint):
 *   1. Google Translate gtx client — fastest, detects source language from response[2]
 *   2. MyMemory API               — free, no key, 5K words/day public limit
 *   3. LibreTranslate instances   — self-hosted fallbacks
 *
 * Returns { translatedText: string, detectedLanguage: string } or null on total failure.
 * Never throws — failures are logged and return null so chat is not disrupted.
 */
async function translateMessage(text, targetCode) {
  if (!text || !targetCode) return null;
  const truncated = text.trim().substring(0, 500);

  // Cache hit — skip all API calls
  const ck = _hashKey(truncated, targetCode);
  const cached = _cacheGet(ck);
  if (cached) return cached;

  // ── 1. Google Translate (gtx) ────────────────────────────────────────────
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetCode}&dt=t&q=${encodeURIComponent(truncated)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (res.ok) {
      const data = await res.json();
      // Shape: [ [[chunk, original, …], …], …, detectedLangCode, … ]
      if (Array.isArray(data) && Array.isArray(data[0])) {
        const translatedText = data[0]
          .filter(c => Array.isArray(c) && c[0])
          .map(c => c[0])
          .join('');
        const detectedLanguage = (typeof data[2] === 'string' && data[2]) ? data[2] : 'und';
        if (translatedText) {
          const r = { translatedText, detectedLanguage };
          _cacheSet(ck, r);
          return r;
        }
      }
    }
  } catch (err) {
    logger.warn('[translateMessage] Google gtx failed:', err.message);
  }

  // ── 2. MyMemory ──────────────────────────────────────────────────────────
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncated)}&langpair=autodetect|${targetCode}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const raw = data?.responseData?.translatedText || '';
      const isRateLimit =
        raw.toUpperCase().includes('MYMEMORY WARNING') ||
        String(data?.responseStatus) === '429';
      if (!isRateLimit && raw) {
        const r = { translatedText: raw, detectedLanguage: 'und' };
        _cacheSet(ck, r);
        return r;
      }
    }
  } catch (err) {
    logger.warn('[translateMessage] MyMemory failed:', err.message);
  }

  // ── 3. LibreTranslate ────────────────────────────────────────────────────
  for (const instance of LIBRE_INSTANCES) {
    try {
      const res = await fetch(`${instance}/translate`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: truncated, source: 'auto', target: targetCode, format: 'text' }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.translatedText) {
        const r = { translatedText: data.translatedText, detectedLanguage: 'und' };
        _cacheSet(ck, r);
        return r;
      }
    } catch (err) {
      logger.warn(`[translateMessage] LibreTranslate ${instance} failed:`, err.message);
    }
  }

  logger.warn('[translateMessage] All providers failed for target:', targetCode);
  return null;
}

module.exports = translateMessage;
