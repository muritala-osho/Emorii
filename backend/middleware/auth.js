const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');
const redis = require('../utils/redis');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Not authorized to access this route' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.sessionId) {
      // Fail CLOSED — if Redis is unreachable we reject rather than allow a
      // potentially revoked token through. This is intentional: a brief Redis
      // outage is safer than letting banned/logged-out sessions stay active.
      let revoked;
      try {
        revoked = await redis.get(`revoked:${decoded.sessionId}`);
      } catch (redisErr) {
        logger.error('Redis revocation check failed — rejecting request to fail closed:', redisErr.message);
        return res.status(503).json({
          success: false,
          message: 'Service temporarily unavailable. Please try again shortly.',
        });
      }
      if (revoked) {
        return res.status(401).json({
          success: false,
          message: 'This session has been revoked. Please log in again.',
          tokenRevoked: true,
        });
      }
      req.sessionId = decoded.sessionId;
    }

    req.user = await User.findById(decoded.id).select('+tokenVersion');

    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== (req.user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
        tokenRevoked: true
      });
    }

    if (req.user.banned) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been banned',
        reason: req.user.banReason
      });
    }

    if (req.user.suspended && req.user.suspendedUntil > Date.now()) {
      let appealToken = null;
      try {
        const jwt = require('jsonwebtoken');
        appealToken = jwt.sign(
          { id: req.user._id, purpose: 'appeal', email: req.user.email },
          process.env.JWT_SECRET,
          { expiresIn: '15m' },
        );
      } catch (_e) {}
      return res.status(403).json({
        success: false,
        message: 'Your account is temporarily suspended',
        isSuspended: true,
        suspendedUntil: req.user.suspendedUntil,
        suspensionReason: req.user.banReason || 'Violation of community guidelines',
        email: req.user.email,
        appealToken,
        appeal: req.user.appeal || null,
      });
    }

    const allowedPaths = [
      '/api/auth/verify-otp',
      '/api/auth/resend-otp',
      '/api/user/upload-photo',
      '/api/user/me'
    ];
    
    const isAllowedPath = allowedPaths.some(path => req.originalUrl.startsWith(path));

    if (!req.user.emailVerified && !isAllowedPath) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email with the OTP sent to you.',
        needsVerification: true
      });
    }

    if (req.user.suspended && req.user.suspendedUntil <= Date.now()) {
      // H-4: Use an atomic conditional findOneAndUpdate instead of read-modify-write
      // (req.user.save). If two concurrent requests both see suspended:true and
      // suspendedUntil <= now, only ONE wins the update; the other gets null back
      // and skips the email, preventing duplicate "suspension lifted" emails.
      const lifted = await User.findOneAndUpdate(
        { _id: req.user._id, suspended: true, suspendedUntil: { $lte: new Date() } },
        { $set: { suspended: false, suspendedUntil: null } },
        { new: false } // returns pre-update doc on match, null if already lifted
      );
      if (lifted) {
        req.user.suspended = false;
        req.user.suspendedUntil = null;
        try {
          const { sendSuspensionLiftedEmail } = require('../utils/emailService');
          await sendSuspensionLiftedEmail(req.user.email, req.user.name);
        } catch (emailErr) {
          logger.error('Suspension lifted email failed:', emailErr.message);
        }
      }
    }

    if (
      req.user.premium?.isActive &&
      req.user.premium?.expiresAt &&
      new Date(req.user.premium.expiresAt) < new Date()
    ) {
      req.user.premium.isActive = false;
      await User.findByIdAndUpdate(req.user._id, { 'premium.isActive': false });
    }

    if (req.sessionId) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      Session.updateOne(
        { sessionId: req.sessionId, lastActive: { $lt: fiveMinutesAgo } },
        { $set: { lastActive: new Date() } }
      ).catch(() => {});
    }

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error.message);
    return res.status(401).json({ 
      success: false, 
      message: 'Not authorized to access this route' 
    });
  }
};

module.exports = { protect };
