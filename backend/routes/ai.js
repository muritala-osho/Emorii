
const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');

// In-memory translation cache: key = "text|sourceLang|targetLang", value = { result, ts }
const translationCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_MAX_SIZE = 500;

function getCached(key) {
  const entry = translationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { translationCache.delete(key); return null; }
  return entry.result;
}

function setCache(key, result) {
  if (translationCache.size >= CACHE_MAX_SIZE) {
    // Evict oldest entry
    const firstKey = translationCache.keys().next().value;
    translationCache.delete(firstKey);
  }
  translationCache.set(key, { result, ts: Date.now() });
}

const LANG_NAME_TO_CODE = {
  'english': 'en', 'french': 'fr', 'spanish': 'es', 'portuguese': 'pt', 'arabic': 'ar',
  'swahili': 'sw', 'amharic': 'am', 'yoruba': 'yo', 'hausa': 'ha', 'igbo': 'ig',
  'zulu': 'zu', 'xhosa': 'xh', 'twi': 'tw', 'wolof': 'wo', 'shona': 'sn',
  'somali': 'so', 'oromo': 'om', 'tigrinya': 'ti', 'afrikaans': 'af', 'malagasy': 'mg',
  'chinese': 'zh', 'mandarin': 'zh', 'cantonese': 'zh', 'hindi': 'hi', 'japanese': 'ja',
  'korean': 'ko', 'german': 'de', 'italian': 'it', 'russian': 'ru', 'turkish': 'tr',
  'dutch': 'nl', 'polish': 'pl', 'czech': 'cs', 'swedish': 'sv', 'danish': 'da',
  'norwegian': 'no', 'finnish': 'fi', 'greek': 'el', 'hungarian': 'hu', 'romanian': 'ro',
  'bulgarian': 'bg', 'croatian': 'hr', 'serbian': 'sr', 'ukrainian': 'uk', 'thai': 'th',
  'vietnamese': 'vi', 'indonesian': 'id', 'malay': 'ms', 'tagalog': 'tl', 'filipino': 'tl',
  'bengali': 'bn', 'tamil': 'ta', 'telugu': 'te', 'urdu': 'ur', 'persian': 'fa',
  'farsi': 'fa', 'hebrew': 'he', 'georgian': 'ka', 'armenian': 'hy', 'nepali': 'ne',
  'sinhala': 'si', 'khmer': 'km', 'lao': 'lo', 'burmese': 'my', 'mongolian': 'mn',
  'kazakh': 'kk', 'uzbek': 'uz', 'azerbaijani': 'az', 'catalan': 'ca', 'basque': 'eu',
  'galician': 'gl', 'maltese': 'mt', 'icelandic': 'is', 'estonian': 'et', 'latvian': 'lv',
  'lithuanian': 'lt', 'albanian': 'sq', 'macedonian': 'mk', 'slovenian': 'sl', 'slovak': 'sk',
  'welsh': 'cy', 'irish': 'ga', 'scottish gaelic': 'gd', 'esperanto': 'eo',
  'latin': 'la', 'hawaiian': 'haw', 'samoan': 'sm', 'maori': 'mi',
  'kinyarwanda': 'rw', 'lingala': 'ln', 'luganda': 'lg', 'tswana': 'tn',
  'sesotho': 'st', 'tsonga': 'ts', 'swati': 'ss', 'venda': 've', 'ndebele': 'nr',
  'punjabi': 'pa', 'gujarati': 'gu', 'marathi': 'mr', 'kannada': 'kn', 'malayalam': 'ml',
  'odia': 'or', 'assamese': 'as', 'pashto': 'ps', 'sindhi': 'sd', 'kurdish': 'ku',
};

function getLanguageCode(langName) {
  const normalized = langName.toLowerCase().trim();
  if (LANG_NAME_TO_CODE[normalized]) return LANG_NAME_TO_CODE[normalized];
  if (normalized.length === 2) return normalized;
  const partial = Object.keys(LANG_NAME_TO_CODE).find(k => k.includes(normalized) || normalized.includes(k));
  if (partial) return LANG_NAME_TO_CODE[partial];
  return null;
}

// Fallback: Google Translate unofficial endpoint (no API key required)
async function translateWithFallback(text, sourceCode, targetCode) {
  // Google Translate and LibreTranslate use "auto" not "autodetect"
  const gtSourceCode = sourceCode === 'autodetect' ? 'auto' : sourceCode;
  // Attempt 1: Google Translate unofficial (gtx client)
  try {
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${gtSourceCode}&tl=${targetCode}&dt=t&q=${encodeURIComponent(text)}`;
    const gtxRes = await fetch(gtxUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (gtxRes.ok) {
      const gtxData = await gtxRes.json();
      // Response shape: [[[translatedChunk, original, ...], ...], ...]
      if (Array.isArray(gtxData) && Array.isArray(gtxData[0])) {
        const translated = gtxData[0]
          .filter(chunk => Array.isArray(chunk) && chunk[0])
          .map(chunk => chunk[0])
          .join('');
        if (translated) {
          logger.info('[Translation] Google Translate (gtx) fallback succeeded');
          return translated;
        }
      }
    }
  } catch (err) {
    logger.warn('[Translation] Google Translate (gtx) fallback failed:', err.message);
  }

  // Attempt 2: LibreTranslate public instances
  const libreInstances = [
    'https://translate.fedilab.app',
    'https://libretranslate.de',
    'https://translate.terraprint.co',
  ];
  for (const instance of libreInstances) {
    try {
      const libreRes = await fetch(`${instance}/translate`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: gtSourceCode, target: targetCode, format: 'text' }),
      });
      if (!libreRes.ok) continue;
      const libreData = await libreRes.json();
      if (libreData && libreData.translatedText) {
        logger.info(`[Translation] LibreTranslate fallback succeeded via ${instance}`);
        return libreData.translatedText;
      }
    } catch (err) {
      logger.warn(`[Translation] LibreTranslate instance ${instance} failed:`, err.message);
    }
  }

  return null;
}

router.post('/translate', protect, async (req, res) => {
  try {
    const { text, targetLanguage, sourceLanguage } = req.body;

    if (!text || !targetLanguage) {
      return res.status(400).json({ success: false, message: 'Text and targetLanguage are required' });
    }

    const targetCode = getLanguageCode(targetLanguage);
    if (!targetCode) {
      return res.status(400).json({ success: false, message: `Language "${targetLanguage}" not recognized.` });
    }

    let sourceCode = 'autodetect';
    if (sourceLanguage && sourceLanguage.toLowerCase() !== 'auto') {
      const resolved = getLanguageCode(sourceLanguage);
      if (resolved) sourceCode = resolved;
    }

    const normalizedText = text.trim().substring(0, 500);
    const cacheKey = `${normalizedText}|${sourceCode}|${targetCode}`;

    // Serve from cache if available (avoids burning rate limit quota)
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ success: true, translatedText: cached, fromCache: true });
    }

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(normalizedText)}&langpair=${sourceCode}|${targetCode}`;
    let data;
    let myMemoryFetchFailed = false;
    try {
      const response = await fetch(url);
      data = await response.json();
    } catch (fetchErr) {
      logger.error('MyMemory fetch error:', fetchErr);
      myMemoryFetchFailed = true;
    }

    // If MyMemory fetch failed entirely, try fallback immediately
    if (myMemoryFetchFailed) {
      const fallback = await translateWithFallback(normalizedText, sourceCode, targetCode);
      if (fallback) {
        setCache(cacheKey, fallback);
        return res.json({ success: true, translatedText: fallback, provider: 'fallback' });
      }
      return res.status(502).json({ success: false, message: 'Translation temporarily unavailable, try again later.' });
    }

    // Detect daily rate limit warning — MyMemory embeds the warning in the translated text
    const rawTranslated = data.responseData?.translatedText || '';
    const isRateLimit =
      rawTranslated.toUpperCase().includes('MYMEMORY WARNING') ||
      (data.responseStatus && String(data.responseStatus) === '429') ||
      (data.responseDetails && data.responseDetails.toUpperCase().includes('MYMEMORY WARNING'));

    if (isRateLimit) {
      logger.warn('[Translation] MyMemory daily limit reached — attempting fallback');
      const fallback = await translateWithFallback(normalizedText, sourceCode, targetCode);
      if (fallback) {
        setCache(cacheKey, fallback);
        return res.json({ success: true, translatedText: fallback, provider: 'fallback' });
      }
      return res.status(429).json({ success: false, message: 'Translation limit reached for today. Please try again tomorrow.' });
    }

    if (rawTranslated) {
      let translatedText = rawTranslated;
      // If match confidence is low, look for a higher-quality match in the matches array
      if (data.responseData.match < 0.5 && data.matches && data.matches.length > 1) {
        const betterMatch = data.matches.find(m => m.translation && m.quality && parseInt(m.quality) > 50);
        if (betterMatch) translatedText = betterMatch.translation;
      }
      setCache(cacheKey, translatedText);
      res.json({ success: true, translatedText });
    } else {
      const detail = data.responseDetails || '';
      const userMsg = detail.toUpperCase().includes('MYMEMORY') || detail.toUpperCase().includes('WARNING')
        ? 'Translation temporarily unavailable, try again later.'
        : 'Translation failed. Please try again.';
      res.status(400).json({ success: false, message: userMsg });
    }
  } catch (error) {
    logger.error('Translation error:', error);
    res.status(500).json({ success: false, message: 'Translation failed. Please try again.' });
  }
});

const romanticTemplates = [
  "Hey! Your smile caught my attention. How's your day going? 😊",
  "I couldn't help but notice we share a love for {interest}. What's your favorite thing about it?",
  "Your profile really stood out to me! Would love to get to know you better ✨",
  "Hi there! I saw you're into {interest} - me too! What got you interested in it?",
  "Hey! Your energy seems amazing. Tell me something interesting about yourself 💫",
  "I love your vibe! What's something you're passionate about?",
  "Your photos are stunning! Where was that picture taken?",
  "Hi! We matched! What's been the highlight of your week? 🌟",
  "Hey! What's your idea of a perfect date?",
  "I noticed we both love {interest}. Any recommendations?",
];

const iceBreakers = [
  "If you could have dinner with anyone, dead or alive, who would it be?",
  "What's your go-to karaoke song?",
  "Beach vacation or mountain retreat?",
  "What's the best advice you've ever received?",
  "If you could master any skill instantly, what would it be?",
  "Coffee or tea? (This is important 😄)",
  "What's your favorite way to spend a Sunday?",
  "What's something you're looking forward to?",
  "Cats or dogs? Or something more exotic?",
  "What's your guilty pleasure TV show?",
];

router.post('/suggest-message', protect, async (req, res) => {
  try {
    const { targetUserId, messageType } = req.body;

    const User = require('../models/User');
    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let suggestions = [];

    if (messageType === 'icebreaker') {
      suggestions = iceBreakers
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
    } else {
      suggestions = romanticTemplates
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(template => {
          let message = template;
          if (template.includes('{interest}') && targetUser.interests && targetUser.interests.length > 0) {
            const randomInterest = targetUser.interests[Math.floor(Math.random() * targetUser.interests.length)];
            message = message.replace('{interest}', randomInterest.toLowerCase());
          } else if (template.includes('{interest}')) {
            message = message.replace(' for {interest}', '').replace(' {interest}', '');
          }
          return message;
        });
    }

    res.json({
      success: true,
      suggestions,
      tip: "Remember to be genuine and authentic! These are just conversation starters.",
    });
  } catch (error) {
    logger.error('Suggest-message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const chatSuggestionTemplates = [
  "Hey! How's your day going? 😊",
  "I love your profile! What are your hobbies?",
  "What's your favorite thing to do on weekends?",
  "I noticed we have similar interests! Tell me more about yourself",
  "You seem really interesting! What do you do for fun?",
  "Hi there! What made you swipe right on me? 😄",
  "I'd love to get to know you better!",
  "What's the best trip you've ever taken?",
  "What are you passionate about?",
  "Any fun plans for this week?",
  "What's your idea of a perfect date?",
  "Tell me something that made you smile today! 😊",
];

router.post('/chat-suggestions', protect, async (req, res) => {
  try {
    const suggestions = chatSuggestionTemplates
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);
    res.json({ success: true, suggestions });
  } catch (error) {
    logger.error('Chat suggestions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
