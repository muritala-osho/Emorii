const logger = require('../utils/logger');
const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const PurchaseLog = require('../models/PurchaseLog');
const { sendPremiumConfirmationEmail } = require('../utils/emailService');
const { applyAppleNotification, applyGoogleNotification } = require('../services/iapWebhookService');

function extractAppleOriginalTransactionId(validationData) {
  if (!validationData) return null;
  const inApp = validationData.receipt?.in_app;
  if (Array.isArray(inApp) && inApp.length) {
    const sorted = [...inApp].sort((a, b) => Number(b.purchase_date_ms || 0) - Number(a.purchase_date_ms || 0));
    return sorted[0].original_transaction_id || null;
  }
  const latest = validationData.latest_receipt_info;
  if (Array.isArray(latest) && latest.length) {
    return latest[0].original_transaction_id || null;
  }
  return null;
}

const PREMIUM_INFO = {
  name: 'Emorii Premium',
  description: 'The ultimate dating experience with all features unlocked',
  features: [
    'Unlimited Likes',
    'See Who Likes You',
    '10 Super Likes Daily',
    'Unlimited Rewinds',
    'Incognito Mode',
    '1 Free Boost Monthly',
    'Global Discovery',
    'Unlimited Calls',
    'Story Viewer Details',
    'Advanced Filters',
    'Premium Badge',
    'No Distance Limits'
  ]
};

const DEFAULT_PRICES = [
  { id: 'emorii_premium_daily',   amount: 99,   currency: 'usd', interval: 'day',   name: 'Premium Daily' },
  { id: 'emorii_premium_weekly',  amount: 499,  currency: 'usd', interval: 'week',  name: 'Premium Weekly' },
  { id: 'emorii_premium_monthly', amount: 999,  currency: 'usd', interval: 'month', name: 'Premium Monthly' },
  { id: 'emorii_premium_yearly',  amount: 4999, currency: 'usd', interval: 'year',  name: 'Premium Yearly' },
];

async function validateAppleReceipt(receiptData) {
  const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET;
  if (!sharedSecret) {
    logger.error('[Apple IAP] APPLE_IAP_SHARED_SECRET not set — refusing to validate receipt without server credentials');
    return { valid: false, error: 'Apple IAP credentials not configured on server. Contact support.' };
  }

  const payload = {
    'receipt-data': receiptData,
    'password': sharedSecret,
    'exclude-old-transactions': true
  };

  try {
    const prodRes = await axios.post('https://buy.itunes.apple.com/verifyReceipt', payload, { timeout: 10000 });
    if (prodRes.data.status === 21007) {
      const sandboxRes = await axios.post('https://sandbox.itunes.apple.com/verifyReceipt', payload, { timeout: 10000 });
      if (sandboxRes.data.status !== 0) {
        return { valid: false, error: `Apple sandbox status ${sandboxRes.data.status}` };
      }
      return { valid: true, data: sandboxRes.data };
    }
    if (prodRes.data.status !== 0) {
      return { valid: false, error: `Apple status ${prodRes.data.status}` };
    }
    return { valid: true, data: prodRes.data };
  } catch (err) {
    logger.error('[Apple IAP] Validation request failed:', err.message);
    return { valid: false, error: err.message };
  }
}

function parseGoogleServiceAccountJson(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return null;

  let candidate = rawValue.trim();
  if (candidate.startsWith('```')) {
    candidate = candidate
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  // Render should contain the JSON object itself, without shell quotes.
  // Accept one accidental outer single-quote pair for easier recovery.
  if (candidate.startsWith("'") && candidate.endsWith("'")) {
    candidate = candidate.slice(1, -1).trim();
  }

  try {
    let parsed = JSON.parse(candidate);
    // Also accept a JSON-encoded JSON object, e.g. an environment value
    // wrapped in an extra pair of JSON double quotes.
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.client_email === 'string' &&
      typeof parsed.private_key === 'string'
    ) {
      return parsed;
    }
  } catch {
    // The caller returns a safe configuration error below.
  }

  return null;
}

async function validateGoogleReceipt(purchaseToken, productId) {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  // This must match android.package in frontend/app.json. Keep the
  // environment variable override for deployments that use a different
  // application ID, but make the current production package work without
  // requiring a second non-secret configuration value.
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.emorii.app';

  if (!serviceAccountJson) {
    logger.error('[Google IAP] GOOGLE_SERVICE_ACCOUNT_JSON not set — refusing to validate receipt without server credentials');
    return { valid: false, error: 'Google IAP credentials not configured on server. Contact support.' };
  }
  if (!packageName) {
    logger.error('[Google IAP] GOOGLE_PLAY_PACKAGE_NAME not set — refusing to validate receipt without package name');
    return { valid: false, error: 'Google IAP package name not configured on server. Contact support.' };
  }

  const serviceAccount = parseGoogleServiceAccountJson(serviceAccountJson);
  if (!serviceAccount) {
    logger.error('[Google IAP] Could not parse GOOGLE_SERVICE_ACCOUNT_JSON');
    return { valid: false, error: 'Invalid service account JSON' };
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    };
    const signedJwt = jwt.sign(jwtPayload, serviceAccount.private_key, { algorithm: 'RS256' });

    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt
    }, { timeout: 10000 });

    const accessToken = tokenRes.data.access_token;

    const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;
    const verifyRes = await axios.get(verifyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });

    const purchase = verifyRes.data;
    if (purchase.paymentState !== 1 && purchase.paymentState !== 2) {
      return { valid: false, error: `Google paymentState=${purchase.paymentState}` };
    }
    return { valid: true, data: purchase };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    logger.error('[Google IAP] Validation request failed:', errMsg);
    return { valid: false, error: errMsg };
  }
}


router.get('/plans', async (req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=1200');
    const plans = [
      {
        id: 'premium_plan',
        name: PREMIUM_INFO.name,
        description: PREMIUM_INFO.description,
        planKey: 'platinum',
        info: PREMIUM_INFO,
        prices: DEFAULT_PRICES
      }
    ];
    res.json({ success: true, plans });
  } catch (error) {
    logger.error('Error fetching plans:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('premium dailySwipes dailySuperLikes');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let isActive = user.premium?.isActive || false;
    if (isActive && user.premium?.expiresAt && new Date(user.premium.expiresAt) < new Date()) {
      isActive = false;
      await User.findByIdAndUpdate(user._id, { 'premium.isActive': false });
    }

    let superLikesRemaining = isActive ? 10 : 0;
    if (isActive && user.dailySuperLikes) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const lastReset = new Date(user.dailySuperLikes.lastReset || 0); lastReset.setHours(0, 0, 0, 0);
      const usedToday = lastReset < today ? 0 : (user.dailySuperLikes.count || 0);
      superLikesRemaining = Math.max(0, 10 - usedToday);
    }

    res.json({
      success: true,
      subscription: {
        isActive,
        expiresAt: user.premium?.expiresAt,
        plan: user.premium?.plan,
        features: isActive ? PREMIUM_INFO.features : []
      },
      usage: {
        swipesRemaining: isActive ? 999 : Math.max(0, 10 - (user.dailySwipes?.count || 0)),
        superLikesRemaining
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/validate-receipt', protect, async (req, res) => {
  try {
    const { platform, receipt, productId } = req.body;

    if (!platform || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Invalid platform. Must be "android" or "ios".' });
    }
    if (!receipt || receipt === 'pending_iap_integration') {
      return res.status(400).json({ success: false, message: 'Valid purchase receipt is required.' });
    }
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const validProductIds = [
      'emorii_premium_daily',
      'emorii_premium_weekly',
      'emorii_premium_monthly',
      'emorii_premium_yearly'
    ];
    if (!validProductIds.includes(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID.' });
    }

    let validationResult;
    if (platform === 'ios') {
      validationResult = await validateAppleReceipt(receipt);
    } else {
      validationResult = await validateGoogleReceipt(receipt, productId);
    }

    if (!validationResult.valid) {
      logger.warn(`[IAP] Receipt rejected for user ${user._id} (${platform}): ${validationResult.error}`);
      const configurationError =
        platform === 'android' &&
        /credentials not configured|Invalid service account JSON|package name not configured/i.test(
          validationResult.error || '',
        );
      return res.status(configurationError ? 503 : 402).json({
        success: false,
        message: configurationError
          ? validationResult.error
          : 'Purchase could not be verified. Please try again.',
      });
    }

    logger.log(`[IAP] Server-side receipt verified for user ${user._id} via ${platform}`);

    const intervalMap = {
      'emorii_premium_daily': 'day',
      'emorii_premium_weekly': 'week',
      'emorii_premium_monthly': 'month',
      'emorii_premium_yearly': 'year'
    };
    const interval = intervalMap[productId] || 'month';
    const durationMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };

    // Use the actual expiry time from the store validation response when
    // available — this is more accurate than computing a fixed duration
    // from the current time. Fall back to the computed duration only when
    // the store does not return an explicit expiry.
    let expiresAt;
    if (platform === 'ios') {
      // Apple returns expires_date_ms on the most-recent receipt entry
      const latestInfo = validationResult.data?.latest_receipt_info;
      const latestEntry = Array.isArray(latestInfo) && latestInfo.length
        ? [...latestInfo].sort((a, b) => Number(b.expires_date_ms || 0) - Number(a.expires_date_ms || 0))[0]
        : null;
      const expiresMs = latestEntry?.expires_date_ms ? Number(latestEntry.expires_date_ms) : null;
      expiresAt = expiresMs && expiresMs > Date.now()
        ? new Date(expiresMs)
        : new Date(Date.now() + durationMs[interval]);
    } else {
      // Google returns expiryTimeMillis on the subscription object
      const expiryTimeMillis = validationResult.data?.expiryTimeMillis
        ? Number(validationResult.data.expiryTimeMillis)
        : null;
      expiresAt = expiryTimeMillis && expiryTimeMillis > Date.now()
        ? new Date(expiryTimeMillis)
        : new Date(Date.now() + durationMs[interval]);
    }

    const update = {
      'premium.isActive': true,
      'premium.plan': interval,
      'premium.source': platform,
      'premium.activatedAt': new Date(),
      'premium.expiresAt': expiresAt,
      'premium.receipt': receipt,
      'premium.productId': productId,
      'premium.autoRenewing': true,
      'premium.features': {
        unlimitedSwipes: true,
        seeWhoLikesYou: true,
        unlimitedRewinds: true,
        boostPerMonth: 10,
        superLikesPerDay: 10,
        noAds: true,
        advancedFilters: true,
        readReceipts: true,
        priorityMatches: true,
        incognitoMode: true
      }
    };
    let idemKey;
    if (platform === 'android') {
      update['premium.purchaseToken'] = receipt;
      idemKey = `validate:android:${receipt.substring(0, 200)}`;
    } else {
      const otId = extractAppleOriginalTransactionId(validationResult.data);
      if (otId) update['premium.originalTransactionId'] = otId;
      if (validationResult.data?.environment) update['premium.environment'] = validationResult.data.environment;
      idemKey = `validate:ios:${otId || receipt.substring(0, 80)}`;
    }

    const existingLog = await PurchaseLog.findOne({ idempotencyKey: idemKey });
    if (existingLog) {
      logger.log(`[IAP] Duplicate validate-receipt ignored for user ${user._id} (${platform})`);
    } else {
      await PurchaseLog.withTransaction(async (session) => {
        await User.findByIdAndUpdate(user._id, update, session ? { session } : {});
        await PurchaseLog.create([{
          userId: user._id,
          platform,
          productId,
          eventType: 'PURCHASE',
          idempotencyKey: idemKey,
          originalTransactionId: update['premium.originalTransactionId'],
          purchaseToken: update['premium.purchaseToken'],
          expiresAt,
          environment: update['premium.environment'],
        }], { session });
      });
      logger.log(`Premium activated for user ${user._id} via ${platform} in-app purchase`);
    }

    sendPremiumConfirmationEmail(user.email, user.firstName || user.name || 'there', interval, expiresAt).catch(() => {});

    res.json({
      success: true,
      message: 'Premium activated successfully',
      subscription: {
        isActive: true,
        plan: interval,
        source: platform,
        features: PREMIUM_INFO.features
      }
    });
  } catch (error) {
    logger.error('Receipt validation error:', error);
    res.status(500).json({ success: false, message: 'Failed to validate receipt' });
  }
});

router.post('/restore-purchases', protect, async (req, res) => {
  try {
    const { platform, receipt, productId } = req.body;

    if (!platform || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Invalid platform. Must be "android" or "ios".' });
    }
    if (!receipt) {
      return res.status(400).json({ success: false, message: 'Receipt is required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let validationResult;
    if (platform === 'ios') {
      validationResult = await validateAppleReceipt(receipt);
    } else {
      const pid = productId || 'emorii_premium_monthly';
      validationResult = await validateGoogleReceipt(receipt, pid);
    }

    if (!validationResult.valid) {
      return res.status(402).json({ success: false, message: 'No valid purchase found to restore.' });
    }

    logger.log(`[IAP Restore] Server-side receipt verified for user ${user._id} via ${platform}`);

    // For iOS: check in_app receipts for most recent active subscription
    let resolvedProductId = productId || 'emorii_premium_monthly';
    if (platform === 'ios' && validationResult.data?.receipt?.in_app) {
      const inAppPurchases = validationResult.data.receipt.in_app;
      const latest = inAppPurchases
        .filter((p) => p.product_id && p.product_id.startsWith('emorii_premium'))
        .sort((a, b) => Number(b.purchase_date_ms) - Number(a.purchase_date_ms))[0];
      if (latest) resolvedProductId = latest.product_id;
    }

    const intervalMap = {
      'emorii_premium_daily': 'day',
      'emorii_premium_weekly': 'week',
      'emorii_premium_monthly': 'month',
      'emorii_premium_yearly': 'year'
    };
    const interval = intervalMap[resolvedProductId] || 'month';
    const durationMs = {
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };

    // Use the actual expiry time from the store validation response when available.
    let restoreExpiresAt;
    if (platform === 'ios') {
      const latestInfo = validationResult.data?.latest_receipt_info;
      const latestEntry = Array.isArray(latestInfo) && latestInfo.length
        ? [...latestInfo].sort((a, b) => Number(b.expires_date_ms || 0) - Number(a.expires_date_ms || 0))[0]
        : null;
      const expiresMs = latestEntry?.expires_date_ms ? Number(latestEntry.expires_date_ms) : null;
      restoreExpiresAt = expiresMs && expiresMs > Date.now()
        ? new Date(expiresMs)
        : new Date(Date.now() + durationMs[interval]);
    } else {
      const expiryTimeMillis = validationResult.data?.expiryTimeMillis
        ? Number(validationResult.data.expiryTimeMillis)
        : null;
      restoreExpiresAt = expiryTimeMillis && expiryTimeMillis > Date.now()
        ? new Date(expiryTimeMillis)
        : new Date(Date.now() + durationMs[interval]);
    }

    const restoreUpdate = {
      'premium.isActive': true,
      'premium.plan': interval,
      'premium.source': platform,
      'premium.restoredAt': new Date(),
      'premium.expiresAt': restoreExpiresAt,
      'premium.receipt': receipt,
      'premium.productId': resolvedProductId,
      'premium.autoRenewing': true,
      'premium.features': {
        unlimitedSwipes: true,
        seeWhoLikesYou: true,
        unlimitedRewinds: true,
        boostPerMonth: 10,
        superLikesPerDay: 10,
        noAds: true,
        advancedFilters: true,
        readReceipts: true,
        priorityMatches: true,
        incognitoMode: true
      }
    };
    let restoreIdemKey;
    if (platform === 'android') {
      restoreUpdate['premium.purchaseToken'] = receipt;
      restoreIdemKey = `restore:android:${receipt.substring(0, 200)}`;
    } else {
      const otId = extractAppleOriginalTransactionId(validationResult.data);
      if (otId) restoreUpdate['premium.originalTransactionId'] = otId;
      if (validationResult.data?.environment) restoreUpdate['premium.environment'] = validationResult.data.environment;
      restoreIdemKey = `restore:ios:${otId || receipt.substring(0, 80)}`;
    }

    const existingRestore = await PurchaseLog.findOne({ idempotencyKey: restoreIdemKey });
    if (!existingRestore) {
      await PurchaseLog.withTransaction(async (session) => {
        await User.findByIdAndUpdate(user._id, restoreUpdate, session ? { session } : {});
        await PurchaseLog.create([{
          userId: user._id,
          platform,
          productId: resolvedProductId,
          eventType: 'RESTORE',
          idempotencyKey: restoreIdemKey,
          originalTransactionId: restoreUpdate['premium.originalTransactionId'],
          purchaseToken: restoreUpdate['premium.purchaseToken'],
          expiresAt: restoreExpiresAt,
          environment: restoreUpdate['premium.environment'],
        }], { session });
      });
    }

    logger.log(`[IAP Restore] Premium restored for user ${user._id} via ${platform}`);

    res.json({
      success: true,
      message: 'Purchase restored successfully',
      subscription: {
        isActive: true,
        plan: interval,
        source: platform,
        features: PREMIUM_INFO.features
      }
    });
  } catch (error) {
    logger.error('Restore purchase error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore purchase. Please try again.' });
  }
});

// Apple App Store Server Notifications V2
// Apple POSTs { signedPayload: <JWS> }. No JWT auth — verified via the signed payload.
router.post('/webhook/apple', async (req, res) => {
  try {
    const signedPayload = req.body?.signedPayload;
    if (!signedPayload || typeof signedPayload !== 'string') {
      logger.warn('[Apple Webhook] Missing signedPayload');
      return res.status(400).json({ success: false });
    }
    const result = await applyAppleNotification(signedPayload);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('[Apple Webhook] Handler error:', err.message);
    // Always 200 so Apple does not retry on parse-time bugs once acknowledged.
    return res.status(200).json({ success: false, error: 'handler_error' });
  }
});

// Google Real-Time Developer Notifications (RTDN) via Pub/Sub push.
// Body shape: { message: { data: <base64-json>, ... }, subscription: <name> }.
// Optional shared-secret protection via ?token= matching GOOGLE_RTDN_TOKEN.
router.post('/webhook/google', async (req, res) => {
  try {
    const expectedToken = process.env.GOOGLE_RTDN_TOKEN;
    if (!expectedToken) {
      logger.error('[Google Webhook] GOOGLE_RTDN_TOKEN not set — rejecting all incoming webhooks. Set this env var to secure the endpoint.');
      return res.status(401).json({ success: false });
    }
    const provided = req.query.token || req.headers['x-rtdn-token'];
    if (provided !== expectedToken) {
      logger.warn('[Google Webhook] Rejected: bad or missing shared token');
      return res.status(401).json({ success: false });
    }
    const result = await applyGoogleNotification(req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('[Google Webhook] Handler error:', err.message);
    // Pub/Sub retries on non-2xx; respond 200 to avoid storms once we've parsed.
    return res.status(200).json({ success: false, error: 'handler_error' });
  }
});

module.exports = router;
