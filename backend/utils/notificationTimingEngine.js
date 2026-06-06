const logger = require('./logger');
/**
 * Emorii Notification Timing Engine
 *
 * Learns the optimal hour (0–23) to send push notifications to each individual
 * user by tracking which notifications they open and when.
 *
 * How it works:
 *   1. Every time we send a push, we log it in user.notificationEngagement[hour].sent++
 *   2. When the user opens a notification (tracked via POST /api/engagement/notification-opened),
 *      we log user.notificationEngagement[hour].opened++
 *   3. getOptimalSendHour(user) returns the hour with the best open rate,
 *      weighted toward recent behaviour using an exponential decay.
 *   4. scheduleNotification(user, payload) either sends immediately (if we're within
 *      ±30 minutes of their optimal hour) or queues a setTimeout to fire at the
 *      next occurrence of that hour today or tomorrow.
 *
 * The per-user engagement array has 24 slots (one per hour, UTC):
 *   notificationEngagement: [{ hour: 0, sent: N, opened: N, lastUpdated: Date }, ...]
 */

const { sendSmartNotification } = require('./pushNotifications');

const MIN_SAMPLES_FOR_LEARNING = 5;
const DEFAULT_SEND_HOURS = [9, 12, 18, 20]; // 9am, noon, 6pm, 8pm (UTC)


/**
 * Returns the hour (0-23, UTC) with the highest open rate for this user.
 * Requires MIN_SAMPLES_FOR_LEARNING total notifications sent before it trusts the data.
 * Falls back to the closest default hour if not enough data.
 */
const getOptimalSendHour = (user) => {
  const engagement = user.notificationEngagement || [];
  const totalSent  = engagement.reduce((s, e) => s + (e.sent || 0), 0);

  if (totalSent < MIN_SAMPLES_FOR_LEARNING) {
    const nowHour = new Date().getUTCHours();
    return DEFAULT_SEND_HOURS.reduce((best, h) => {
      const distBest = Math.min(Math.abs(nowHour - best), 24 - Math.abs(nowHour - best));
      const distH    = Math.min(Math.abs(nowHour - h),    24 - Math.abs(nowHour - h));
      return distH < distBest ? h : best;
    }, DEFAULT_SEND_HOURS[0]);
  }

  let bestHour = DEFAULT_SEND_HOURS[0];
  let bestRate = -1;

  for (const slot of engagement) {
    if (!slot || (slot.sent || 0) < 2) continue; // need at least 2 data points per hour
    const rate = (slot.opened || 0) / slot.sent;
    if (rate > bestRate) {
      bestRate = rate;
      bestHour = slot.hour;
    }
  }

  return bestHour;
};

/**
 * Returns the number of milliseconds until the next occurrence of targetHour (UTC).
 * If targetHour is within the next 30 minutes, returns 0 (send now).
 */
const msUntilNextOccurrence = (targetHour) => {
  const now      = new Date();
  const nowMs    = now.getTime();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour, 0, 0, 0));
  
  let targetMs = todayUTC.getTime();
  
  if (targetMs < nowMs - 30 * 60 * 1000) {
    targetMs += 24 * 60 * 60 * 1000;
  }

  const diff = targetMs - nowMs;
  return diff <= 30 * 60 * 1000 ? 0 : diff; // within 30 mins → send now
};

/**
 * Records that a notification was sent at this hour.
 * Call this every time you send a push to update the model.
 */
const recordNotificationSent = (user, hourUTC) => {
  if (!user.notificationEngagement) user.notificationEngagement = [];

  let slot = user.notificationEngagement.find(e => e.hour === hourUTC);
  if (!slot) {
    slot = { hour: hourUTC, sent: 0, opened: 0 };
    user.notificationEngagement.push(slot);
  }
  slot.sent++;
  slot.lastUpdated = new Date();
};

/**
 * Records that a notification was opened.
 * Call this from the /api/engagement/notification-opened endpoint.
 */
const recordNotificationOpened = (user, hourUTC) => {
  if (!user.notificationEngagement) user.notificationEngagement = [];

  let slot = user.notificationEngagement.find(e => e.hour === hourUTC);
  if (!slot) {
    slot = { hour: hourUTC, sent: 1, opened: 0 };
    user.notificationEngagement.push(slot);
  }
  slot.opened = Math.min((slot.opened || 0) + 1, slot.sent || 1);
  slot.lastUpdated = new Date();
};

/**
 * Smart notification dispatcher.
 *
 * If sendNow=true or user has no push token, falls back to immediate send.
 * Otherwise, delays delivery until the user's optimal engagement hour.
 *
 * @param {Object} user     - Mongoose user document (must have pushToken, notificationEngagement)
 * @param {Object} payload  - { title, body, data, channelId }
 * @param {boolean} sendNow - Bypass timing and send immediately
 * @param {string} type     - Notification type passed to sendSmartNotification
 * @returns {{ scheduled: boolean, delayMs: number }}
 */
const scheduleNotification = async (user, payload, sendNow = false, type = 'system') => {
  if (!user?.pushToken) {
    return { scheduled: false, reason: 'no_push_token' };
  }

  const optimalHour = getOptimalSendHour(user);
  const delayMs     = sendNow ? 0 : msUntilNextOccurrence(optimalHour);

  const doSend = async (targetUser) => {
    try {
      const sendHourUTC = new Date().getUTCHours();
      recordNotificationSent(targetUser, sendHourUTC);
      await targetUser.save();
      await sendSmartNotification(targetUser, payload, type);
    } catch (err) {
      logger.error('[TimingEngine] Push send error:', err.message);
    }
  };

  if (delayMs === 0) {
    await doSend(user);
    return { scheduled: true, delayMs: 0, sentNow: true };
  } else {
    setTimeout(async () => {
      try {
        const User = require('../models/User');
        const freshUser = await User.findById(user._id).select(
          'pushToken notificationEngagement pushNotificationsEnabled muteSettings notificationPreferences'
        );
        if (freshUser?.pushToken) {
          const sendHourUTC = new Date().getUTCHours();
          recordNotificationSent(freshUser, sendHourUTC);
          await freshUser.save();
          await sendSmartNotification(freshUser, payload, type);
        }
      } catch (err) {
        logger.error('[TimingEngine] Delayed push error:', err.message);
      }
    }, delayMs);

    const delayHours = Math.round(delayMs / (1000 * 60 * 60) * 10) / 10;
    logger.log(`[TimingEngine] Notification scheduled for user ${user._id} in ${delayHours}h (optimal hour: ${optimalHour}:00 UTC)`);
    return { scheduled: true, delayMs, sentNow: false, optimalHour };
  }
};

/**
 * Returns a human-readable engagement summary for a user (used in admin dashboard).
 */
const getEngagementSummary = (user) => {
  const engagement  = user.notificationEngagement || [];
  const totalSent   = engagement.reduce((s, e) => s + (e.sent || 0), 0);
  const totalOpened = engagement.reduce((s, e) => s + (e.opened || 0), 0);
  const openRate    = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : null;
  const optimalHour = getOptimalSendHour(user);

  return {
    totalSent,
    totalOpened,
    openRatePercent: openRate,
    optimalHour,
    optimalHourLabel: `${String(optimalHour).padStart(2, '0')}:00 UTC`,
    hasEnoughData: totalSent >= MIN_SAMPLES_FOR_LEARNING,
  };
};

module.exports = {
  getOptimalSendHour,
  scheduleNotification,
  recordNotificationSent,
  recordNotificationOpened,
  getEngagementSummary,
  msUntilNextOccurrence,
};
