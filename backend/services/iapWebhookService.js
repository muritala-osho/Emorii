const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const User = require('../models/User');
const PurchaseLog = require('../models/PurchaseLog');
const { withTransaction } = PurchaseLog;

const PRODUCT_INTERVAL_MAP = {
  emorii_premium_daily: 'day',
  emorii_premium_weekly: 'week',
  emorii_premium_monthly: 'month',
  emorii_premium_yearly: 'year'
};

const PREMIUM_FEATURES = {
  unlimitedSwipes: true,
  seeWhoLikesYou: true,
  unlimitedRewinds: true,
  boostPerMonth: 10,
  superLikesPerDay: 10,
  noAds: true,
  advancedFilters: true,
  readReceipts: true,
  seenAtTimestamp: true,
  priorityMatches: true,
  incognitoMode: true
};

const FREE_FEATURES = {
  unlimitedSwipes: false,
  seeWhoLikesYou: false,
  unlimitedRewinds: false,
  boostPerMonth: 0,
  superLikesPerDay: 0,
  noAds: false,
  advancedFilters: false,
  readReceipts: false,
  seenAtTimestamp: false,
  priorityMatches: false,
  incognitoMode: false
};

function base64UrlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function decodeJwsPayload(jws) {
  if (typeof jws !== 'string') throw new Error('JWS must be a string');
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWS');
  const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  return { header, payload, signature: parts[2], signingInput: `${parts[0]}.${parts[1]}` };
}

function verifyJwsWithLeafCert(jws) {
  const { header, signingInput, signature } = decodeJwsPayload(jws);
  if (!Array.isArray(header.x5c) || header.x5c.length === 0) {
    throw new Error('JWS missing x5c certificate chain');
  }
  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported JWS alg: ${header.alg}`);
  }
  const leafDer = Buffer.from(header.x5c[0], 'base64');
  const leafPem =
    '-----BEGIN CERTIFICATE-----\n' +
    leafDer.toString('base64').match(/.{1,64}/g).join('\n') +
    '\n-----END CERTIFICATE-----\n';
  const publicKey = crypto.createPublicKey(leafPem);

  const sigBytes = base64UrlDecode(signature);
  if (sigBytes.length !== 64) throw new Error('Unexpected ES256 signature length');
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const derSig = encodeEcdsaDer(r, s);

  const verifier = crypto.createVerify('SHA256');
  verifier.update(signingInput);
  verifier.end();
  const ok = verifier.verify(publicKey, derSig);
  if (!ok) throw new Error('JWS signature verification failed');
  return true;
}

function encodeEcdsaDer(r, s) {
  const trim = (b) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let out = b.slice(i);
    if (out[0] & 0x80) out = Buffer.concat([Buffer.from([0]), out]);
    return out;
  };
  const rT = trim(r);
  const sT = trim(s);
  const seqLen = 2 + rT.length + 2 + sT.length;
  return Buffer.concat([
    Buffer.from([0x30, seqLen]),
    Buffer.from([0x02, rT.length]), rT,
    Buffer.from([0x02, sT.length]), sT
  ]);
}

function maybeVerifyAppleJws(jws) {
  const verifyEnabled = process.env.APPLE_WEBHOOK_VERIFY_SIGNATURE !== 'false';
  if (!verifyEnabled) return { verified: false, skipped: true };
  try {
    verifyJwsWithLeafCert(jws);
    return { verified: true };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

function intervalFromProduct(productId) {
  return PRODUCT_INTERVAL_MAP[productId] || 'month';
}

function durationMs(interval) {
  return {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000
  }[interval] || 30 * 24 * 60 * 60 * 1000;
}

async function findUserForApple({ originalTransactionId, transactionId }) {
  if (originalTransactionId) {
    const u = await User.findOne({ 'premium.originalTransactionId': originalTransactionId });
    if (u) return u;
  }
  if (transactionId) {
    return User.findOne({ 'premium.originalTransactionId': transactionId });
  }
  return null;
}

async function findUserForGoogle({ purchaseToken }) {
  if (!purchaseToken) return null;
  return User.findOne({ 'premium.purchaseToken': purchaseToken });
}

async function applyAppleNotification(jws) {
  const verification = maybeVerifyAppleJws(jws);
  if (verification.error) {
    logger.warn(`[Apple Webhook] Signature verification failed: ${verification.error}`);
    return { handled: false, reason: 'invalid_signature' };
  }
  if (verification.skipped) {
    logger.warn('[Apple Webhook] Signature verification disabled via APPLE_WEBHOOK_VERIFY_SIGNATURE=false');
  }

  const { payload } = decodeJwsPayload(jws);
  const notificationType = payload.notificationType;
  const subtype = payload.subtype;
  const data = payload.data || {};

  let txInfo = {};
  let renewalInfo = {};
  if (data.signedTransactionInfo) {
    try { txInfo = decodeJwsPayload(data.signedTransactionInfo).payload; } catch {}
  }
  if (data.signedRenewalInfo) {
    try { renewalInfo = decodeJwsPayload(data.signedRenewalInfo).payload; } catch {}
  }

  const originalTransactionId =
    txInfo.originalTransactionId || data.originalTransactionId || renewalInfo.originalTransactionId;
  const transactionId = txInfo.transactionId;
  const productId = txInfo.productId || renewalInfo.productId;
  const expiresDateMs = txInfo.expiresDate;
  const environment = data.environment || payload.environment || null;

  const user = await findUserForApple({ originalTransactionId, transactionId });
  if (!user) {
    logger.warn(`[Apple Webhook] No user matched originalTransactionId=${originalTransactionId} (type=${notificationType})`);
    return { handled: false, reason: 'user_not_found' };
  }

  const baseUpdate = {
    'premium.lastEventType': notificationType + (subtype ? `:${subtype}` : ''),
    'premium.lastEventAt': new Date(),
    'premium.environment': environment
  };
  if (productId) baseUpdate['premium.productId'] = productId;
  if (originalTransactionId) baseUpdate['premium.originalTransactionId'] = originalTransactionId;

  let stateUpdate = {};
  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
    case 'OFFER_REDEEMED':
    case 'DID_CHANGE_RENEWAL_PREF':
    case 'PRICE_INCREASE': {
      const interval = intervalFromProduct(productId);
      const expiresAt = expiresDateMs ? new Date(Number(expiresDateMs)) : new Date(Date.now() + durationMs(interval));
      stateUpdate = {
        'premium.isActive': true,
        'premium.plan': interval,
        'premium.source': 'ios',
        'premium.expiresAt': expiresAt,
        'premium.activatedAt': user.premium?.activatedAt || new Date(),
        'premium.cancelledAt': null,
        'premium.autoRenewing': renewalInfo.autoRenewStatus === 1,
        'premium.features': PREMIUM_FEATURES
      };
      break;
    }
    case 'DID_CHANGE_RENEWAL_STATUS': {
      stateUpdate = { 'premium.autoRenewing': renewalInfo.autoRenewStatus === 1 };
      if (renewalInfo.autoRenewStatus === 0) stateUpdate['premium.cancelledAt'] = new Date();
      break;
    }
    case 'DID_FAIL_TO_RENEW':
    case 'GRACE_PERIOD_EXPIRED': {
      // Keep premium active until expiresAt; just record the event.
      stateUpdate = { 'premium.autoRenewing': false };
      break;
    }
    case 'EXPIRED':
    case 'REVOKE':
    case 'REFUND': {
      stateUpdate = {
        'premium.isActive': false,
        'premium.plan': 'free',
        'premium.cancelledAt': new Date(),
        'premium.autoRenewing': false,
        'premium.features': FREE_FEATURES
      };
      break;
    }
    case 'TEST': {
      logger.log('[Apple Webhook] TEST notification received');
      return { handled: true, type: 'TEST' };
    }
    default:
      logger.log(`[Apple Webhook] Unhandled notificationType=${notificationType} subtype=${subtype}`);
      stateUpdate = {};
  }

  const idemKey = `apple:${originalTransactionId}:${notificationType}:${expiresDateMs || 'no-exp'}`;
  const existing = await PurchaseLog.findOne({ idempotencyKey: idemKey });
  if (existing) {
    logger.log(`[Apple Webhook] Duplicate event ignored: ${notificationType} for user ${user._id}`);
    return { handled: true, type: notificationType, duplicate: true };
  }

  const finalUpdate = { ...baseUpdate, ...stateUpdate };
  await withTransaction(async (session) => {
    await User.findByIdAndUpdate(user._id, finalUpdate, session ? { session } : {});
    await PurchaseLog.create([{
      userId: user._id,
      platform: 'ios',
      productId,
      eventType: notificationType + (subtype ? `:${subtype}` : ''),
      idempotencyKey: idemKey,
      originalTransactionId,
      expiresAt: expiresDateMs ? new Date(Number(expiresDateMs)) : undefined,
      environment,
    }], { session });
  });
  logger.log(`[Apple Webhook] Applied ${notificationType}${subtype ? '/' + subtype : ''} to user ${user._id}`);
  return { handled: true, type: notificationType };
}

async function getGoogleAccessToken() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return null;
  let serviceAccount;
  try { serviceAccount = JSON.parse(serviceAccountJson); }
  catch { return null; }

  const now = Math.floor(Date.now() / 1000);
  const signedJwt = jwt.sign({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }, serviceAccount.private_key, { algorithm: 'RS256' });

  const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signedJwt
  }, { timeout: 10000 });
  return tokenRes.data.access_token;
}

function isAllowedGooglePackageName(packageName) {
  if (typeof packageName !== 'string') return false;
  const allowed = new Set(
    [process.env.GOOGLE_PLAY_PACKAGE_NAME].filter(Boolean)
  );
  return allowed.has(packageName);
}

function isValidGoogleSubscriptionId(subscriptionId) {
  return typeof subscriptionId === 'string' && /^[A-Za-z0-9._-]+$/.test(subscriptionId);
}

function isValidGooglePurchaseToken(purchaseToken) {
  return typeof purchaseToken === 'string' && /^[A-Za-z0-9._-]+$/.test(purchaseToken);
}

async function fetchGoogleSubscription({ packageName, subscriptionId, purchaseToken }) {
  const token = await getGoogleAccessToken();
  if (!token) return null;

  if (!isAllowedGooglePackageName(packageName) || !isValidGoogleSubscriptionId(subscriptionId) || !isValidGooglePurchaseToken(purchaseToken)) {
    logger.warn('[Google Webhook] Invalid packageName/subscriptionId/purchaseToken; skipping Google API fetch');
    return null;
  }

  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(subscriptionId)}/tokens/${encodeURIComponent(purchaseToken)}`;
  try {
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });
    return res.data;
  } catch (err) {
    logger.warn(`[Google Webhook] Could not fetch subscription: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
}

const GOOGLE_NOTIFICATION_TYPES = {
  1: 'RECOVERED',
  2: 'RENEWED',
  3: 'CANCELED',
  4: 'PURCHASED',
  5: 'ON_HOLD',
  6: 'IN_GRACE_PERIOD',
  7: 'RESTARTED',
  8: 'PRICE_CHANGE_CONFIRMED',
  9: 'DEFERRED',
  10: 'PAUSED',
  11: 'PAUSE_SCHEDULE_CHANGED',
  12: 'REVOKED',
  13: 'EXPIRED'
};

async function applyGoogleNotification(pubsubBody) {
  const message = pubsubBody?.message;
  if (!message?.data) {
    logger.warn('[Google Webhook] Missing message.data');
    return { handled: false, reason: 'no_data' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
  } catch (err) {
    logger.warn(`[Google Webhook] Could not decode payload: ${err.message}`);
    return { handled: false, reason: 'decode_failed' };
  }

  if (payload.testNotification) {
    logger.log('[Google Webhook] TEST notification received');
    return { handled: true, type: 'TEST' };
  }

  const subNotif = payload.subscriptionNotification;
  if (!subNotif) {
    logger.log('[Google Webhook] No subscriptionNotification (likely one-time/voided)');
    return { handled: true, type: 'IGNORED' };
  }

  const typeName = GOOGLE_NOTIFICATION_TYPES[subNotif.notificationType] || `UNKNOWN_${subNotif.notificationType}`;
  const purchaseToken = subNotif.purchaseToken;
  const subscriptionId = subNotif.subscriptionId;
  const packageName = payload.packageName || process.env.GOOGLE_PLAY_PACKAGE_NAME;

  const user = await findUserForGoogle({ purchaseToken });
  if (!user) {
    logger.warn(`[Google Webhook] No user matched purchaseToken (type=${typeName})`);
    return { handled: false, reason: 'user_not_found' };
  }

  const subData = await fetchGoogleSubscription({ packageName, subscriptionId, purchaseToken });
  const expiresAt = subData?.expiryTimeMillis ? new Date(Number(subData.expiryTimeMillis)) : null;
  const autoRenewing = typeof subData?.autoRenewing === 'boolean' ? subData.autoRenewing : null;

  const baseUpdate = {
    'premium.lastEventType': typeName,
    'premium.lastEventAt': new Date(),
    'premium.productId': subscriptionId,
    'premium.purchaseToken': purchaseToken
  };

  let stateUpdate = {};
  switch (typeName) {
    case 'PURCHASED':
    case 'RECOVERED':
    case 'RENEWED':
    case 'RESTARTED':
    case 'IN_GRACE_PERIOD':
    case 'PRICE_CHANGE_CONFIRMED':
    case 'DEFERRED': {
      const interval = intervalFromProduct(subscriptionId);
      stateUpdate = {
        'premium.isActive': true,
        'premium.plan': interval,
        'premium.source': 'android',
        'premium.expiresAt': expiresAt || new Date(Date.now() + durationMs(interval)),
        'premium.activatedAt': user.premium?.activatedAt || new Date(),
        'premium.cancelledAt': null,
        'premium.autoRenewing': autoRenewing !== null ? autoRenewing : true,
        'premium.features': PREMIUM_FEATURES
      };
      break;
    }
    case 'CANCELED': {
      stateUpdate = {
        'premium.cancelledAt': new Date(),
        'premium.autoRenewing': false
      };
      break;
    }
    case 'ON_HOLD':
    case 'PAUSED':
    case 'PAUSE_SCHEDULE_CHANGED': {
      stateUpdate = { 'premium.autoRenewing': false };
      break;
    }
    case 'EXPIRED':
    case 'REVOKED': {
      stateUpdate = {
        'premium.isActive': false,
        'premium.plan': 'free',
        'premium.cancelledAt': new Date(),
        'premium.autoRenewing': false,
        'premium.features': FREE_FEATURES
      };
      break;
    }
    default:
      logger.log(`[Google Webhook] Unhandled type=${typeName}`);
  }

  const idemKey = `google:${purchaseToken}:${typeName}`;
  const existing = await PurchaseLog.findOne({ idempotencyKey: idemKey });
  if (existing) {
    logger.log(`[Google Webhook] Duplicate event ignored: ${typeName} for user ${user._id}`);
    return { handled: true, type: typeName, duplicate: true };
  }

  const finalUpdate = { ...baseUpdate, ...stateUpdate };
  await withTransaction(async (session) => {
    await User.findByIdAndUpdate(user._id, finalUpdate, session ? { session } : {});
    await PurchaseLog.create([{
      userId: user._id,
      platform: 'android',
      productId: subscriptionId,
      eventType: typeName,
      idempotencyKey: idemKey,
      purchaseToken,
      expiresAt,
    }], { session });
  });
  logger.log(`[Google Webhook] Applied ${typeName} to user ${user._id}`);
  return { handled: true, type: typeName };
}

module.exports = {
  applyAppleNotification,
  applyGoogleNotification,
  decodeJwsPayload,
  PREMIUM_FEATURES,
  FREE_FEATURES,
  intervalFromProduct,
  durationMs
};
