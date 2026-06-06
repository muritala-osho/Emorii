const User = require('../models/User');
const redis = require('../utils/redis');
const logger = require('../utils/logger');
const { sendNotification } = require('./notificationService');
const { sendVerificationRevokedEmail } = require('../utils/emailService');

const createServiceError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const revokeVerification = async ({ userId, reason, adminId }) => {
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

  if (!trimmedReason) {
    throw createServiceError('Reason is required', 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw createServiceError('User not found', 404);
  }

  if (!user.verified && !user.isVerified) {
    throw createServiceError('User is already not verified', 400);
  }

  user.verified = false;
  user.isVerified = false;
  user.isFaceVerified = false;
  user.verificationStatus = 'none';
  user.verificationHistory = user.verificationHistory || [];
  user.verificationHistory.push({
    action: 'revoked',
    reason: trimmedReason,
    adminId,
    timestamp: new Date(),
  });

  await user.save();
  await redis.del(`profile:me:${user._id}`);

  await sendNotification(
    user._id,
    `Your verified badge has been removed. Reason: ${trimmedReason}`,
  );

  if (user.email) {
    try {
      await sendVerificationRevokedEmail(user.email, user.name, trimmedReason);
    } catch (emailError) {
      logger.error('Failed to send verification revoked email:', emailError);
    }
  }

  return user;
};

module.exports = {
  revokeVerification,
};