const logger = require('./logger');

const STALE_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-recipient',
]);

function isStaleTokenError(err) {
  if (!err) return false;
  if (STALE_TOKEN_CODES.has(err.code)) return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('requested entity was not found') ||
         msg.includes('registration-token-not-registered') ||
         msg.includes('invalid registration token');
}

let admin = null;
let _initialized = false;

function getAdmin() {
  if (_initialized) return admin;
  _initialized = true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    logger.warn('[FCM] FIREBASE_SERVICE_ACCOUNT not set — FCM data messages will be skipped.');
    return null;
  }

  try {
    const firebaseAdmin = require('firebase-admin');
    if (firebaseAdmin.apps.length === 0) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount),
      });
      logger.log('[FCM] Firebase Admin initialized — project:', serviceAccount.project_id || '(unknown)');
    } else {
      logger.log('[FCM] Firebase Admin already initialized');
    }
    admin = firebaseAdmin;
  } catch (err) {
    logger.error('[FCM] Failed to initialize Firebase Admin:', err.message);
    admin = null;
  }

  return admin;
}

async function sendFcmDataMessage(fcmToken, data, options = {}) {
  if (!fcmToken) return null;

  const firebaseAdmin = getAdmin();
  if (!firebaseAdmin) return null;

  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }

  const messageType = options.type || 'call';
  let collapseKey;
  let ttl;

  if (messageType === 'call') {
    collapseKey = `call_${data.callerId || 'unknown'}`;
    ttl = options.ttl || 30000;
  } else if (messageType === 'message') {
    collapseKey = `msg_${data.messageId || data.matchId || 'unknown'}`;
    ttl = options.ttl || 86400000;
  } else {
    collapseKey = `generic_${data.senderId || data.callerId || 'unknown'}`;
    ttl = options.ttl || 86400000;
  }

  try {
    const result = await firebaseAdmin.messaging().send({
      token: fcmToken,
      data: stringData,
      android: {
        priority: 'high',
        ttl,
        collapseKey,
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
      },
    });
    logger.log(`[FCM] ${messageType} message sent:`, result);
    return result;
  } catch (err) {
    if (isStaleTokenError(err)) {
      logger.warn(`[FCM] Stale FCM token rejected by Firebase (${err.message}). Clearing token from DB.`);
      // Auto-clear the stale token so future calls don't waste time retrying.
      if (options.userId) {
        try {
          const User = require('../models/User');
          await User.updateOne({ _id: options.userId, fcmToken }, { $unset: { fcmToken: '' } });
          logger.log(`[FCM] Cleared stale fcmToken for user ${options.userId}`);
        } catch (dbErr) {
          logger.error('[FCM] Failed to clear stale token from DB:', dbErr.message);
        }
      }
    } else {
      logger.error(`[FCM] Failed to send ${messageType} message:`, err.message);
    }
    return undefined;
  }
}

async function sendCallDataMessage(fcmToken, { callerId, callerName, callerPhoto, callType, callData, userId } = {}) {
  return sendFcmDataMessage(
    fcmToken,
    {
      type:        'incoming_call',
      callId:      callerId    || '',
      callerId:    callerId    || '',
      callerName:  callerName  || '',
      callerPhoto: callerPhoto || '',
      callType:    callType    || 'voice',
      callData:    callData    || {},
    },
    { type: 'call', userId }
  );
}

async function sendCancelCallDataMessage(fcmToken, { callerId, userId } = {}) {
  return sendFcmDataMessage(fcmToken, {
    type:     'cancel_call',
    callerId: callerId || '',
  }, { userId });
}

async function sendMessageDataMessage(fcmToken, { matchId, messageId, senderId, senderName, senderPhoto, body, badge, userId } = {}) {
  return sendFcmDataMessage(
    fcmToken,
    {
      type:        'message',
      matchId:     matchId     || '',
      messageId:   messageId   || '',
      senderId:    senderId    || '',
      senderName:  senderName  || '',
      senderPhoto: senderPhoto || '',
      body:        body        || '',
      badge:       String(badge ?? 0),
    },
    { type: 'message', userId }
  );
}

async function sendFcmNotificationFallback(fcmToken, { title, body, data = {}, channelId = 'default', sound = 'default', userId } = {}) {
  if (!fcmToken) return null;

  const firebaseAdmin = getAdmin();
  if (!firebaseAdmin) return null;

  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }

  try {
    const result = await firebaseAdmin.messaging().send({
      token: fcmToken,
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: channelId || 'default',
          sound: sound || 'default',
          defaultSound: !sound || sound === 'default',
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: { title, body },
            sound: sound || 'default',
            badge: 1,
          },
        },
      },
    });
    logger.log(`[FCM] Notification fallback sent to user ${userId || '?'} — channel: ${channelId}`);
    return result;
  } catch (err) {
    if (isStaleTokenError(err)) {
      logger.warn(`[FCM] Stale FCM token in notification fallback (${err.message}). Clearing from DB.`);
      if (userId) {
        try {
          const User = require('../models/User');
          await User.updateOne({ _id: userId, fcmToken }, { $unset: { fcmToken: '' } });
          logger.log(`[FCM] Cleared stale fcmToken for user ${userId}`);
        } catch (dbErr) {
          logger.error('[FCM] Failed to clear stale token from DB:', dbErr.message);
        }
      }
    } else {
      logger.error('[FCM] Notification fallback failed:', err.message);
    }
    return null;
  }
}

module.exports = { sendFcmDataMessage, sendCallDataMessage, sendCancelCallDataMessage, sendMessageDataMessage, sendFcmNotificationFallback };
