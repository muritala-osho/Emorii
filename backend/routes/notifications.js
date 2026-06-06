const logger = require('../utils/logger');
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const { Expo } = require('expo-server-sdk');

router.use((req, res, next) => {
  logger.log(`[Notifications Route] ${req.method} ${req.path} — user: ${req.user?._id || 'unauthenticated'}`);
  next();
});

router.post('/register-token', protect, async (req, res) => {
  const userId = req.user?._id;
  logger.log(`[Notifications] register-token called — userId: ${userId}`);

  try {
    const { pushToken } = req.body;

    if (!pushToken) {
      logger.warn(`[Notifications] register-token — no token in body for user ${userId}`);
      return res.status(400).json({
        success: false,
        message: 'Push token is required',
      });
    }

    if (!Expo.isExpoPushToken(pushToken)) {
      logger.warn(`[Notifications] register-token — invalid Expo token format for user ${userId}: ${pushToken}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid Expo push token format',
      });
    }

    await User.findByIdAndUpdate(userId, {
      pushToken,
      pushTokenUpdatedAt: new Date(),
      pushNotificationsEnabled: true,
    });

    logger.log(`[Notifications] Token stored for user ${userId}: ${pushToken.slice(0, 40)}…`);

    res.json({
      success: true,
      message: 'Push token registered successfully',
    });
  } catch (error) {
    logger.error(`[Notifications] register-token error for user ${userId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
});

router.post('/register-fcm-token', protect, async (req, res) => {
  const userId = req.user?._id;
  logger.log(`[Notifications] register-fcm-token called — userId: ${userId}`);
  try {
    const { fcmToken, platform } = req.body;
    if (!fcmToken) {
      logger.warn(`[Notifications] register-fcm-token — no fcmToken in body for user ${userId}`);
      return res.status(400).json({ success: false, message: 'fcmToken is required' });
    }

    logger.log(`[Notifications] register-fcm-token — token suffix: …${fcmToken.slice(-12)} | platform: ${platform || 'unknown'} | userId: ${userId}`);

    // Check if user already has a token so we can log new vs update
    const existing = await User.findById(userId, { fcmToken: 1 });
    const isNew = !existing?.fcmToken;
    const tokenChanged = !isNew && existing.fcmToken !== fcmToken;

    const update = { fcmToken, fcmTokenUpdatedAt: new Date() };
    if (platform && ['ios', 'android', 'web'].includes(platform)) {
      update.platform = platform;
    }
    await User.findByIdAndUpdate(userId, update);

    if (isNew) {
      logger.log(`[Notifications] FCM token registered for user ${userId} — suffix: …${fcmToken.slice(-12)}`);
    } else if (tokenChanged) {
      logger.log(`[Notifications] FCM token updated for user ${userId} — new suffix: …${fcmToken.slice(-12)}`);
    } else {
      logger.log(`[Notifications] FCM token unchanged for user ${userId} — suffix: …${fcmToken.slice(-12)}`);
    }

    res.json({ success: true, message: 'FCM token registered' });
  } catch (error) {
    logger.error(`[Notifications] register-fcm-token error for user ${userId}:`, error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/register-timezone', protect, async (req, res) => {
  const userId = req.user?._id;
  try {
    const { timezone } = req.body;
    if (!timezone || typeof timezone !== 'string' || timezone.length > 64) {
      return res.status(400).json({ success: false, message: 'Valid timezone is required' });
    }
    await User.findByIdAndUpdate(userId, { timezone });
    res.json({ success: true, message: 'Timezone registered' });
  } catch (error) {
    logger.error(`[Notifications] register-timezone error for user ${userId}:`, error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/register-voip-token', protect, async (req, res) => {
  const userId = req.user?._id;
  logger.log(`[Notifications] register-voip-token — userId: ${userId}`);

  try {
    const { voipToken } = req.body;

    if (!voipToken) {
      return res.status(400).json({ success: false, message: 'voipToken is required' });
    }

    await User.findByIdAndUpdate(userId, { voipPushToken: voipToken });
    logger.log(`[Notifications] VoIP token stored for user ${userId}: ${voipToken.slice(0, 20)}…`);
    res.json({ success: true, message: 'VoIP token registered' });
  } catch (error) {
    logger.error(`[Notifications] register-voip-token error for user ${userId}:`, error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/send', protect, async (req, res) => {
  const callerId = req.user?._id;
  logger.log(`[Notifications] /send called by user ${callerId}`);

  try {
    const { userId, title, body, data } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      logger.warn(`[Notifications] /send — target user ${userId} not found`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.pushToken) {
      logger.warn(`[Notifications] /send — user ${userId} has no push token stored`);
      return res.status(404).json({
        success: false,
        message: 'User has no push token — they may not have opened the app yet or permissions were denied',
      });
    }

    logger.log(`[Notifications] /send — sending to user ${userId}, token: ${user.pushToken.slice(0, 40)}…`);
    const { sendSmartNotification } = require('../utils/pushNotifications');
    const sent = await sendSmartNotification(user, { title, body, data }, 'system');

    logger.log(`[Notifications] /send — result: ${sent ? 'sent' : 'suppressed'}`);
    res.json({ success: true, sent, message: sent ? 'Notification sent' : 'Notification suppressed by user preferences' });
  } catch (error) {
    logger.error('[Notifications] /send error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/test', protect, async (req, res) => {
  const userId = req.user?._id;
  logger.log(`[Notifications] /test called — userId: ${userId}`);

  try {
    const user = await User.findById(userId).select(
      'pushToken pushNotificationsEnabled muteSettings notificationPreferences name'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.pushToken) {
      logger.warn(`[Notifications] /test — user ${userId} has no push token. They need to open the app on a device first.`);
      return res.status(400).json({
        success: false,
        message: 'No push token found for your account. Open the app on a physical device first to register a token.',
        debug: {
          pushNotificationsEnabled: user.pushNotificationsEnabled,
          hasPushToken: false,
        },
      });
    }

    if (!Expo.isExpoPushToken(user.pushToken)) {
      logger.warn(`[Notifications] /test — stored token is invalid: ${user.pushToken}`);
      return res.status(400).json({
        success: false,
        message: 'Stored push token is invalid. Open the app on a physical device to re-register.',
        debug: { storedToken: user.pushToken },
      });
    }

    logger.log(`[Notifications] /test — sending test notification to user ${userId} at token ${user.pushToken.slice(0, 40)}…`);

    const { sendExpoPushNotification } = require('../utils/pushNotifications');
    const tickets = await sendExpoPushNotification(user.pushToken, {
      title: '🔔 Test Notification',
      body: 'If you see this, push notifications are working correctly!',
      data: { type: 'test' },
      priority: 'high',
      channelId: 'default',
    });

    logger.log(`[Notifications] /test — Expo tickets:`, JSON.stringify(tickets));

    res.json({
      success: true,
      message: 'Test notification sent — check your device.',
      debug: {
        userId,
        tokenPreview: user.pushToken.slice(0, 40) + '…',
        expoTickets: tickets,
      },
    });
  } catch (error) {
    logger.error('[Notifications] /test error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

router.get('/status', protect, async (req, res) => {
  const userId = req.user?._id;
  try {
    const user = await User.findById(userId).select('pushToken pushNotificationsEnabled');
    res.json({
      success: true,
      hasPushToken: !!user?.pushToken,
      pushNotificationsEnabled: user?.pushNotificationsEnabled ?? false,
      tokenPreview: user?.pushToken ? user.pushToken.slice(0, 40) + '…' : null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const Notification = require('../models/Notification');

router.get('/', protect, async (req, res) => {
  const userId = req.user?._id;
  try {
    const { page = 1, limit = 30, type } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 30));
    const filter = { recipient: userId };
    if (type && type !== 'all') filter.type = type;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .populate('sender', 'name photos verified')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: userId, read: false }),
    ]);

    res.json({ success: true, notifications, total, unreadCount, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (error) {
    logger.error('[Notifications] list error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/unread-count', protect, async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { recipient: req.user._id, read: false };
    if (type) filter.type = { $in: type.split(',') };
    const count = await Notification.countDocuments(filter);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/mark-type-read', protect, async (req, res) => {
  try {
    const { type } = req.body;
    if (!type) return res.status(400).json({ success: false, message: 'type is required' });
    const types = type.split(',');
    await Notification.updateMany(
      { recipient: req.user._id, type: { $in: types }, read: false },
      { read: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.patch('/:id/read', protect, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { read: true },
      { new: false }
    );

    if (notif && notif.data && notif.data.matchId && (notif.type === 'message' || notif.data.type === 'message')) {
      try {
        const Message = require('../models/Message');
        await Message.updateMany(
          { matchId: notif.data.matchId, receiver: req.user._id, seen: false },
          { seen: true, seenAt: new Date(), status: 'seen' }
        );
      } catch (chatErr) {
        logger.error('[Notifications] chat read-receipt error:', chatErr);
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/clear', protect, async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
