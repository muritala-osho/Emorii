const logger = require('../utils/logger');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendSmartNotification } = require('../utils/pushNotifications');

const sendNotification = async (userId, message) => {
  const user = await User.findById(userId).select(
    'name pushToken pushNotificationsEnabled notificationPreferences muteSettings'
  );

  if (!user) {
    const error = new Error('Notification recipient not found');
    error.statusCode = 404;
    throw error;
  }

  await Notification.create({
    recipient: user._id,
    type: 'verification',
    title: 'Verification Update',
    body: message,
    data: {
      type: 'verification_revoked',
    },
  });

  try {
    await sendSmartNotification(user, {
      title: 'Verification Update',
      body: message,
      data: {
        type: 'verification_revoked',
      },
    }, 'system');
  } catch (error) {
    logger.error('Push notification failed:', error);
  }
};

module.exports = {
  sendNotification,
};