const logger = require('./logger');
const { Expo } = require('expo-server-sdk');
const { logPush } = require('./notificationLogger');

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  useFcmV1: true,
});

function normalizePhotoUrl(photo) {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  return photo.url || photo.uri || photo.path || '';
}

async function clearInvalidToken(pushToken) {
  try {
    const User = require('../models/User');
    await User.updateOne({ pushToken }, { $unset: { pushToken: '' } });
    logger.warn(`[Push] Cleared invalid/unregistered token: ${pushToken}`);
  } catch (err) {
    logger.error('[Push] Failed to clear invalid token from DB:', err.message);
  }
}

async function checkPushReceipts(ticketIdMap) {
  if (!ticketIdMap || ticketIdMap.size === 0) return;

  const receiptIds = [...ticketIdMap.keys()];
  if (receiptIds.length === 0) return;

  try {
    const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    for (const chunk of receiptIdChunks) {
      let receipts;
      try {
        receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      } catch (err) {
        logger.error('[Push] Receipt fetch error:', err.message);
        continue;
      }

      for (const [receiptId, receipt] of Object.entries(receipts)) {
        if (receipt.status === 'error') {
          logger.error(`[Push] Receipt error for ${receiptId}: ${receipt.message}`, receipt.details);
          if (receipt.details?.error === 'DeviceNotRegistered') {
            const token = ticketIdMap.get(receiptId);
            if (token) await clearInvalidToken(token);
          }
        }
      }
    }
  } catch (err) {
    logger.error('[Push] Receipt check failed:', err.message);
  }
}

async function sendExpoPushNotification(pushToken, { title, body, data, priority, sound, channelId, ttl, badge, userId, type, richContent, mutableContent, categoryIdentifier }) {
  if (!Expo.isExpoPushToken(pushToken)) {
    logger.warn(`[Push] Invalid Expo push token — skipping: ${pushToken}`);
    logPush({ pushToken, title, body, data, userId, type, status: 'failed', errorMessage: 'Invalid Expo push token' }).catch(() => {});
    return null;
  }

  let safeRichContent;
  if (richContent && typeof richContent.image === 'string') {
    const img = richContent.image.trim();
    if (img.startsWith('https://')) {
      safeRichContent = { image: img };
    }
  }

  const message = {
    to: pushToken,
    sound: sound || 'default',
    title,
    body,
    data: data || {},
    priority: priority || 'high',
    channelId: channelId || 'default',
    ...(ttl !== undefined ? { ttl } : {}),
    ...(badge !== undefined ? { badge } : {}),
    ...(safeRichContent ? { richContent: safeRichContent } : {}),
    ...(mutableContent !== undefined ? { mutableContent } : {}),
    ...(categoryIdentifier ? { categoryIdentifier } : {}),
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    }

    const ticketIdMap = new Map();
    let firstTicketId = null;
    let anyError = null;
    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        anyError = ticket.message || (ticket.details && ticket.details.error) || 'unknown';
        logger.error(`[Push] Ticket error: ${ticket.message}`, ticket.details);
        if (ticket.details?.error === 'DeviceNotRegistered') {
          await clearInvalidToken(pushToken);
        }
      } else if (ticket.id) {
        if (!firstTicketId) firstTicketId = ticket.id;
        ticketIdMap.set(ticket.id, pushToken);
      }
    }
    logPush({
      pushToken, title, body, data, userId, type,
      status: anyError ? 'failed' : 'sent',
      providerId: firstTicketId,
      errorMessage: anyError,
    }).catch(() => {});

    if (ticketIdMap.size > 0) {
      setTimeout(() => checkPushReceipts(ticketIdMap), 2 * 60 * 1000);
      setTimeout(() => checkPushReceipts(ticketIdMap), 20 * 60 * 1000);
    }

    logger.log(`[Push] Sent: "${title}" → ${pushToken.slice(0, 30)}…`);
    return tickets;
  } catch (error) {
    logger.error('[Push] Error sending notification:', error);
    return null;
  }
}

async function sendSmartNotification(user, payload, type = 'system', mutedByUserId = null) {
  const userId = user?._id?.toString() || 'unknown';

  const channelMap = {
    message:    'messages_v2',
    match:      'matches',
    like:       'likes',
    voice_call: 'calls',
    video_call: 'calls',
    support:    'support',
    system:     'default',
  };

  const priorityMap = {
    message:    'high',
    match:      'high',
    like:       'normal',
    voice_call: 'high',
    video_call: 'high',
    support:    'normal',
    system:     'normal',
  };

  const ttlMap = {
    voice_call: 86400,
    video_call: 86400,
    message:    86400,
    match:      86400,
    like:       86400,
    support:    86400,
    system:     86400,
  };

  if (user.pushNotificationsEnabled === false) {
    logger.log(`[Push] Suppressed (notifications disabled) — user ${userId}, type: ${type}`);
    return false;
  }

  const prefs = user.notificationPreferences || {};
  const mute  = user.muteSettings || {};
  const isCall = type === 'voice_call' || type === 'video_call';

  if (type === 'message'    && prefs.messagesEnabled   === false) {
    logger.log(`[Push] Suppressed (messages disabled) — user ${userId}`);
    return false;
  }
  if (type === 'match'      && prefs.matchesEnabled    === false) {
    logger.log(`[Push] Suppressed (matches disabled) — user ${userId}`);
    return false;
  }
  if (type === 'like'       && prefs.likesEnabled      === false) {
    logger.log(`[Push] Suppressed (likes disabled) — user ${userId}`);
    return false;
  }
  if (type === 'voice_call' && prefs.voiceCallsEnabled === false) {
    logger.log(`[Push] Suppressed (voice calls disabled) — user ${userId}`);
    return false;
  }
  if (type === 'video_call' && prefs.videoCallsEnabled === false) {
    logger.log(`[Push] Suppressed (video calls disabled) — user ${userId}`);
    return false;
  }

  if (mutedByUserId && mute.mutedUsers?.length) {
    const muteEntry = mute.mutedUsers.find(
      (m) => m.userId?.toString() === mutedByUserId.toString()
    );
    if (muteEntry) {
      if (muteEntry.muteAll) {
        logger.log(`[Push] Suppressed (user muted sender) — user ${userId}`);
        return false;
      }
      if (type === 'message'    && muteEntry.muteMessages) {
        logger.log(`[Push] Suppressed (messages muted for sender) — user ${userId}`);
        return false;
      }
      if (type === 'voice_call' && muteEntry.muteVoiceCalls) {
        logger.log(`[Push] Suppressed (voice calls muted for sender) — user ${userId}`);
        return false;
      }
      if (type === 'video_call' && muteEntry.muteVideoCalls) {
        logger.log(`[Push] Suppressed (video calls muted for sender) — user ${userId}`);
        return false;
      }
    }
  }

  if (mute.globalMute?.enabled) {
    if (!(isCall && mute.globalMute.allowCalls)) {
      const now    = new Date();
      const pad    = (n) => String(n).padStart(2, '0');
      const nowStr = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
      const start  = mute.globalMute.startTime || '22:00';
      const end    = mute.globalMute.endTime   || '08:00';

      const inQuietHours =
        start <= end
          ? nowStr >= start && nowStr < end
          : nowStr >= start || nowStr < end;

      if (inQuietHours) {
        logger.log(`[Push] Suppressed (quiet hours ${start}–${end} UTC, now ${nowStr}) — user ${userId}`);
        return false;
      }
    }
  }

  const sound     = prefs.soundEnabled === false ? null : 'default';
  const channelId = payload.channelId || channelMap[type] || 'default';

  const safeExpoChannel = channelId;

  const normalizedData = { ...(payload.data || {}) };
  if (normalizedData.senderPhoto) normalizedData.senderPhoto = normalizePhotoUrl(normalizedData.senderPhoto);
  if (normalizedData.callerPhoto)  normalizedData.callerPhoto  = normalizePhotoUrl(normalizedData.callerPhoto);

  if (user?.pushToken && Expo.isExpoPushToken(user.pushToken)) {
    await sendExpoPushNotification(user.pushToken, {
      ...payload,
      data: normalizedData,
      priority: priorityMap[type] || 'high',
      sound,
      channelId: safeExpoChannel,
      ttl: ttlMap[type] ?? 86400,
      ...(payload.badge       !== undefined ? { badge: payload.badge }                       : {}),
      ...(payload.richContent               ? { richContent: payload.richContent }           : {}),
      ...(payload.mutableContent !== undefined ? { mutableContent: payload.mutableContent } : {}),
      ...(payload.categoryIdentifier        ? { categoryIdentifier: payload.categoryIdentifier } : {}),
      userId,
      type,
    });
    return true;
  }

  let fcmToken = user?.fcmToken || null;
  if (!fcmToken && userId !== 'unknown') {
    try {
      const User = require('../models/User');
      const u = await User.findById(userId).select('fcmToken').lean();
      fcmToken = u?.fcmToken || null;
    } catch (dbErr) {
      logger.warn('[Push] FCM fallback DB lookup failed:', dbErr?.message || dbErr);
    }
  }

  if (fcmToken) {
    const { sendFcmNotificationFallback } = require('./fcmPush');
    const safeFcmChannel = channelId;
    const result = await sendFcmNotificationFallback(fcmToken, {
      title:     payload.title,
      body:      payload.body,
      data:      { ...normalizedData, type },
      channelId: safeFcmChannel,
      sound,
      userId,
    });
    return !!result;
  }

  logger.log(`[Push] Suppressed (no Expo token, no FCM token) — user ${userId}, type: ${type}`);
  return false;
}

module.exports = { sendExpoPushNotification, sendSmartNotification, expo };
