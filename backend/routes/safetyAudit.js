const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const crypto = require('crypto');
const { protect } = require('../middleware/auth');
const Match = require('../models/Match');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { logAudit } = require('../utils/auditHelper');

const HIGH_SEVERITY_THRESHOLD = 5;
const LOOKBACK_HOURS = 24;
const AUTO_PAUSE_HOURS = 24;

const ALLOWED_REASONS = new Set([
  'Phone number',
  'Email address',
  'Web link',
  'Social handle',
  'Street address',
  'Off-platform messaging app',
  'Other social platform',
  'Request to move off-app',
  'Financial / sensitive credentials',
  'In-person meetup proposal',
]);

const HIGH_RISK_REASONS = new Set([
  'Financial / sensitive credentials',
  'Off-platform messaging app',
  'Request to move off-app',
]);

router.post('/warning-bypassed', protect, async (req, res) => {
  try {
    const { matchId, reasons, contentLength } = req.body || {};

    if (!Array.isArray(reasons) || reasons.length === 0) {
      return res.status(400).json({ success: false, message: 'reasons array required' });
    }

    const cleanReasons = reasons
      .filter((r) => typeof r === 'string' && ALLOWED_REASONS.has(r))
      .slice(0, 10);

    if (cleanReasons.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid reasons supplied' });
    }

    const sender = req.user;
    let recipient = null;
    let matchDoc = null;

    if (matchId && /^[a-fA-F0-9]{24}$/.test(matchId)) {
      matchDoc = await Match.findById(matchId).select('users').lean();
      if (matchDoc && Array.isArray(matchDoc.users)) {
        const otherId = matchDoc.users.find(
          (uid) => String(uid) !== String(sender._id),
        );
        if (otherId) {
          recipient = await User.findById(otherId).select('name email').lean();
        }
      }
    }

    const severity = cleanReasons.some((r) => HIGH_RISK_REASONS.has(r)) ? 'high' : 'medium';

    const ipAddress =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      undefined;

    const contentHash =
      typeof contentLength === 'number'
        ? crypto
            .createHash('sha256')
            .update(`${sender._id}:${matchId || ''}:${Date.now()}`)
            .digest('hex')
            .slice(0, 16)
        : undefined;

    await logAudit({
      action: 'SAFETY_WARNING_BYPASSED',
      category: 'USER_SAFETY',
      severity,
      adminId: sender._id,
      adminName: sender.name || 'Unknown',
      adminEmail: sender.email,
      targetUserId: recipient?._id,
      targetUserName: recipient?.name,
      targetUserEmail: recipient?.email,
      details: `Sent message after dismissing safety warning (${cleanReasons.join(', ')})`,
      metadata: {
        reasons: cleanReasons,
        matchId: matchId || null,
        contentLength: typeof contentLength === 'number' ? contentLength : null,
        contentRef: contentHash,
      },
      ipAddress,
    });

    // Auto-pause check: if this user has crossed the high-severity threshold
    // in the last 24 hours, pause their messaging and let admins review.
    if (severity === 'high') {
      try {
        const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
        const recentHighCount = await AuditLog.countDocuments({
          adminId:  sender._id,
          action:   'SAFETY_WARNING_BYPASSED',
          severity: 'high',
          createdAt: { $gte: since },
        });

        const freshUser = await User.findById(sender._id).select('messagingPaused name email');
        const alreadyPaused = freshUser?.messagingPaused?.isPaused &&
          freshUser?.messagingPaused?.until &&
          new Date(freshUser.messagingPaused.until) > new Date();

        if (recentHighCount >= HIGH_SEVERITY_THRESHOLD && !alreadyPaused && freshUser) {
          const pauseUntil = new Date(Date.now() + AUTO_PAUSE_HOURS * 60 * 60 * 1000);
          freshUser.messagingPaused = {
            isPaused: true,
            until: pauseUntil,
            reason: `Auto-paused: ${recentHighCount} high-risk safety warnings bypassed in ${LOOKBACK_HOURS}h. Pending admin review.`,
            autoTriggeredAt: new Date(),
            bypassCount: recentHighCount,
          };
          await freshUser.save();

          await logAudit({
            action: 'SAFETY_WARNING_BYPASSED',
            category: 'USER_SAFETY',
            severity: 'critical',
            adminId: freshUser._id,
            adminName: freshUser.name || 'Unknown',
            adminEmail: freshUser.email,
            details: `AUTO-PAUSE: Messaging suspended for ${AUTO_PAUSE_HOURS}h after ${recentHighCount} high-risk bypasses in ${LOOKBACK_HOURS}h. Admin review required.`,
            metadata: {
              autoPause: true,
              bypassCount: recentHighCount,
              pausedUntil: pauseUntil,
            },
          });

          // Best-effort socket notification to the user's app
          try {
            const ioInstance = req.app.get('io');
            if (ioInstance) {
              ioInstance.to(String(freshUser._id)).emit('user:messaging-paused', {
                until: pauseUntil,
                reason: 'For your safety and others, messaging has been paused while our team reviews your recent activity.',
              });
            }
          } catch (_socketErr) { /* non-fatal */ }
        }
      } catch (autoPauseErr) {
        logger.error('[safetyAudit] auto-pause check failed:', autoPauseErr);
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('[safetyAudit] failed:', error);
    res.status(500).json({ success: false, message: 'Failed to log safety event' });
  }
});

module.exports = router;
