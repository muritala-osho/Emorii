const logger = require('../utils/logger');

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { adminEmailLimiter } = require('../middleware/rateLimiter');
// M-12: Import the canonical isAdmin guard from the shared middleware module
// instead of defining it locally. All admin sub-routes (auditLog, adminSentry,
// scheduledBroadcasts, safetyAudit) should import from here too for a single
// enforced gate rather than duplicated local definitions.
const { isAdmin } = require('../middleware/supportAccess');
const User = require('../models/User');
const Report = require('../models/Report');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Story = require('../models/Story');
const AuditLog = require('../models/AuditLog');
const AdminPushSubscription = require('../models/AdminPushSubscription');
const redis = require('../utils/redis');
const verificationController = require('../controllers/verificationController');
const { sendAdminPushNotification, VAPID_PUBLIC_KEY } = require('../services/adminPushService');

const logAudit = async (req, action, category, severity, targetUser, details, metadata) => {
  try {
    await AuditLog.create({
      action,
      category,
      severity: severity || 'medium',
      adminId:    req.user._id,
      adminName:  req.user.name,
      adminEmail: req.user.email,
      targetUserId:    targetUser?._id  || null,
      targetUserName:  targetUser?.name || null,
      targetUserEmail: targetUser?.email || null,
      details:  details  || null,
      metadata: metadata || null,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
    });
    if (action === 'SAFETY_WARNING_BYPASSED') {
      sendAdminPushNotification({
        type: 'SAFETY_BYPASS',
        body: `${req.user.name} bypassed a safety warning${targetUser ? ` while messaging ${targetUser.name}` : ''}. Review immediately.`,
        data: { tab: 'content' },
      }).catch(() => {});
    } else if (severity === 'high' && !['SAFETY_ACTION_TAKEN', 'SAFETY_DISMISSED', 'REMOVE_CONTENT', 'APPROVE_CONTENT'].includes(action)) {
      sendAdminPushNotification({
        type: 'HIGH_SEVERITY',
        body: details || `A high-severity event occurred: ${action}`,
        data: { tab: 'dashboard' },
      }).catch(() => {});
    }
  } catch (e) {
    logger.error('[AuditLog] Failed to write audit entry:', e.message);
  }
};

// M-12: isAdmin is now imported from ../middleware/supportAccess (see above).
// The local definition has been removed to avoid divergence between this file
// and the shared middleware used by support routes.

router.get('/push-vapid-key', protect, isAdmin, (req, res) => {
  res.json({ success: true, publicKey: VAPID_PUBLIC_KEY });
});

router.post('/push-subscribe', protect, isAdmin, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, message: 'Invalid subscription object' });
    }
    await AdminPushSubscription.findOneAndUpdate(
      { endpoint },
      { adminId: req.user._id, adminEmail: req.user.email, endpoint, keys, userAgent: req.headers['user-agent'], lastUsed: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Push subscription saved' });
  } catch (error) {
    logger.error('Push subscribe error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/push-unsubscribe', protect, isAdmin, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await AdminPushSubscription.deleteOne({ endpoint });
    } else {
      await AdminPushSubscription.deleteMany({ adminId: req.user._id });
    }
    res.json({ success: true, message: 'Unsubscribed from push notifications' });
  } catch (error) {
    logger.error('Push unsubscribe error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/push-test', protect, isAdmin, async (req, res) => {
  try {
    await sendAdminPushNotification({
      type: 'HIGH_SEVERITY',
      body: 'This is a test notification from Emorii Admin.',
      data: { tab: 'dashboard' },
      targetAdminId: req.user._id,
    });
    res.json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared computation helpers used by the per-endpoint routes AND the merged
// /overview endpoint below. Centralising them means any caching, parallelism,
// or schema changes only need to happen in one place.
// ─────────────────────────────────────────────────────────────────────────────

const OVERVIEW_TTL_SECONDS = 30; // dashboards poll every 60s — 30s is plenty fresh

async function computeBadgeCounts() {
  const SupportTicket = require('../models/SupportTicket');
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [reports, verifications, appeals, safetyBypasses, openTickets, unreadTickets] = await Promise.all([
    Report.countDocuments({ status: 'pending' }),
    User.countDocuments({ verificationStatus: 'pending' }),
    User.countDocuments({ 'appeal.status': 'pending', banned: true }),
    AuditLog.countDocuments({ action: 'SAFETY_WARNING_BYPASSED', createdAt: { $gte: since24h } }),
    SupportTicket.countDocuments({ status: 'open' }).catch(() => 0),
    SupportTicket.countDocuments({ status: 'open', unreadByAgent: { $gt: 0 } }).catch(() => 0),
  ]);
  return {
    reports,
    verifications,
    appeals,
    content: reports + safetyBypasses,
    tickets: openTickets,
    unreadTickets,
  };
}

async function computeStats() {
  // Was 7 sequential queries (each waiting for the previous) — easily ~300ms+
  // on a healthy Mongo cluster, much worse on a slow link. Now they all run
  // at once and the route finishes as soon as the slowest one returns.
  const [
    totalUsers,
    verifiedUsers,
    activeToday,
    totalMatches,
    totalMessages,
    pendingReports,
    bannedUsers,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ verified: true }),
    User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    Match.countDocuments({ status: 'active' }),
    // M-3: estimatedDocumentCount() reads collection metadata in O(1) instead
    // of scanning every document. Exact counts aren't needed for a dashboard KPI.
    Message.estimatedDocumentCount(),
    Report.countDocuments({ status: 'pending' }),
    User.countDocuments({ banned: true }),
  ]);
  return { totalUsers, verifiedUsers, activeToday, totalMatches, totalMessages, pendingReports, bannedUsers };
}

// L-6: Accept an optional live socket count so callers can pass the exact
// real-time connection count from the in-memory onlineUsers Map (O(1))
// instead of relying on the DB approximation (users active in the last hour).
async function computeActivity(onlineCount = null) {
  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last7d  = new Date(now - 7  * 24 * 60 * 60 * 1000);
  const lastHour = new Date(now - 60 * 60 * 1000);
  const [active24h, active7d, messages24h, onlineFromDb] = await Promise.all([
    User.countDocuments({ lastActive: { $gte: last24h } }),
    User.countDocuments({ lastActive: { $gte: last7d } }),
    Message.countDocuments({ createdAt: { $gte: last24h } }),
    // Only run DB query when live count was not provided.
    onlineCount !== null
      ? Promise.resolve(null)
      : User.countDocuments({ lastActive: { $gte: lastHour } }),
  ]);
  const onlineNow = onlineCount !== null ? onlineCount : onlineFromDb;
  return { active24h, active7d, onlineNow, messages24h };
}

// Generic cache-aside wrapper. Returns the cached value when fresh, otherwise
// computes, stores, and returns. Logs hit/miss so production can be verified.
async function withCache(key, ttl, compute) {
  const cached = await redis.get(key);
  if (cached) {
    logger.log(`[AdminCache] HIT ${key}`);
    return cached;
  }
  logger.log(`[AdminCache] MISS ${key}`);
  const value = await compute();
  await redis.set(key, value, ttl);
  return value;
}

router.get('/badge-counts', protect, isAdmin, async (req, res) => {
  try {
    const counts = await withCache('admin:badge-counts', OVERVIEW_TTL_SECONDS, computeBadgeCounts);
    res.json({ success: true, counts });
  } catch (error) {
    logger.error('Badge counts error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Single round-trip that powers the entire dashboard overview. Replaces FOUR
// separate requests (stats + activity + badge-counts + pending reports) that
// the dashboard used to fire on mount and on every poll.
router.get('/overview', protect, isAdmin, async (req, res) => {
  try {
    const [stats, activity, counts, pendingReports] = await Promise.all([
      withCache('admin:stats',        OVERVIEW_TTL_SECONDS, computeStats),
      // L-6: Pass live socket count so computeActivity uses the exact in-memory
      // online count (O(1)) instead of a DB approximation.
      withCache('admin:activity', OVERVIEW_TTL_SECONDS,
        () => computeActivity(req.app.get('onlineUsers')?.size ?? null)),
      withCache('admin:badge-counts', OVERVIEW_TTL_SECONDS, computeBadgeCounts),
      withCache('admin:pending-reports-preview', OVERVIEW_TTL_SECONDS, async () => {
        const reports = await Report.find({ status: 'pending' })
          .populate('reporter',     'name email')
          .populate('reportedUser', 'name email photos')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();
        return reports;
      }),
    ]);
    res.json({ success: true, stats, activity, counts, pendingReports });
  } catch (error) {
    logger.error('Overview error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/reports', protect, isAdmin, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    // M-4: Paginated reports — replaces the hard .limit(100) with cursor-based
    // pagination so the endpoint stays fast as the reports collection grows.
    const pageNum  = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limitNum = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const query = status === 'all' ? {} : { status };

    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('reporter',     'name email')
        .populate('reportedUser', 'name email photos')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Report.countDocuments(query),
    ]);

    res.json({
      success: true,
      reports,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    logger.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.put('/reports/:reportId/resolve', protect, isAdmin, adminEmailLimiter, async (req, res) => {
  try {
    const { action, notes } = req.body; // action: 'dismiss', 'warn', 'suspend', 'ban'

    // H-3: Atomic status transition — only succeeds if the report is still
    // 'pending'. If two admins resolve the same report simultaneously, only
    // one wins; the other gets null and receives a 409. This prevents the
    // double-ban / double-email race condition from the original read-modify-write.
    const report = await Report.findOneAndUpdate(
      { _id: req.params.reportId, status: 'pending' },
      { $set: { status: 'resolved', resolvedBy: req.user._id, resolvedAt: new Date(), adminNotes: notes } },
      { new: false } // return pre-update doc so we have reportedUser ref
    );
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found or already resolved',
      });
    }

    // H-3: User moderation actions use idempotent $set with conditions so a
    // duplicate action (e.g. banning an already-banned user) is a no-op.
    const reportedUser = await User.findById(report.reportedUser);

    if (reportedUser) {
      if (action === 'warn') {
        // $inc is atomic — safe to call concurrently
        await User.findByIdAndUpdate(reportedUser._id, { $inc: { warnings: 1 } });
        reportedUser.warnings = (reportedUser.warnings || 0) + 1;
        try {
          const { sendWarningEmail } = require('../utils/emailService');
          await sendWarningEmail(reportedUser.email, reportedUser.name, notes || 'Violation of community guidelines');
        } catch (e) { logger.error('Warning email failed:', e.message); }
      } else if (action === 'suspend') {
        const suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        // H-3: Idempotent — only updates if not already suspended. A duplicate
        // action returns null and skips the email, preventing duplicate notices.
        const suspendResult = await User.findOneAndUpdate(
          { _id: reportedUser._id, suspended: { $ne: true } },
          { $set: { suspended: true, suspendedUntil } },
          { new: false }
        );
        if (suspendResult) {
          reportedUser.suspended = true;
          reportedUser.suspendedUntil = suspendedUntil;
          try {
            const { sendSuspensionEmail } = require('../utils/emailService');
            await sendSuspensionEmail(reportedUser.email, reportedUser.name, notes || 'Repeated violation of community guidelines', 7);
          } catch (e) { logger.error('Suspension email failed:', e.message); }
        }
      } else if (action === 'ban') {
        const bannedAt = new Date();
        // H-3: Idempotent — only updates if not already banned.
        const banResult = await User.findOneAndUpdate(
          { _id: reportedUser._id, banned: { $ne: true } },
          { $set: { banned: true, bannedAt, banReason: notes } },
          { new: false }
        );
        if (banResult) {
          reportedUser.banned = true;
          reportedUser.bannedAt = bannedAt;
          reportedUser.banReason = notes;
          try {
            const { sendBanNotificationEmail } = require('../utils/emailService');
            await sendBanNotificationEmail(reportedUser.email, reportedUser.name, notes || 'Violation of community guidelines');
          } catch (e) { logger.error('Ban email failed:', e.message); }
        }
      }

      try {
        const ioInstance = req.app.get('io');
        if (ioInstance) {
          const uid = reportedUser._id.toString();
          if (action === 'ban') {
            ioInstance.to(uid).emit('user:banned', {
              reason: notes || 'Violation of community guidelines',
              bannedAt: reportedUser.bannedAt,
            });
            await redis.del(`profile:me:${uid}`);
          } else if (action === 'suspend') {
            ioInstance.to(uid).emit('user:suspended', {
              reason: notes || 'Repeated violation of community guidelines',
              suspendedUntil: reportedUser.suspendedUntil,
            });
            await redis.del(`profile:me:${uid}`);
          }
        }
      } catch (socketErr) {
        logger.error('Failed to emit moderation socket event:', socketErr.message);
      }
    }

    await logAudit(req, 'RESOLVE_REPORT', 'MODERATION', action === 'ban' ? 'critical' : 'medium',
      reportedUser || null,
      `Report resolved with action: ${action}. ${notes ? 'Notes: ' + notes : ''}`,
      { reportId: req.params.reportId, action });

    res.json({
      success: true,
      message: 'Report resolved',
      report
    });
  } catch (error) {
    logger.error('Resolve report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/users', protect, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, gender, minAge, maxAge, status } = req.query;
    const query = {};

    if (search) {
      const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } }
      ];
    }
    if (gender) query.gender = gender;
    if (minAge || maxAge) {
      query.age = {};
      if (minAge) query.age.$gte = parseInt(minAge);
      if (maxAge) query.age.$lte = parseInt(maxAge);
    }
    if (status) {
      if (status === 'banned') query.banned = true;
      if (status === 'suspended') query.suspended = true;
      if (status === 'warned') query.warnings = { $gt: 0 };
      if (status === 'verified') query.verified = true;
      if (status === 'pending_verification') query.verificationStatus = 'pending';
      if (status === 'active_today') {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        query.lastActive = { $gte: startOfDay };
      }
      if (status === 'active_24h') {
        query.lastActive = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
      }
      if (status === 'active_7d') {
        query.lastActive = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      }
      if (status === 'has_matches') {
        const matchedIds = await Match.distinct('users');
        query._id = { $in: matchedIds };
      }
      if (status === 'sent_messages') {
        const senderIds = await Message.distinct('sender');
        query._id = { $in: senderIds };
      }
      if (status === 'messages_24h') {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const senderIds = await Message.distinct('sender', { createdAt: { $gte: since } });
        query._id = { $in: senderIds };
      }
    }

    const activitySorts = ['active_today', 'active_24h', 'active_7d'];
    const sortField = activitySorts.includes(status) ? { lastActive: -1 } : { createdAt: -1 };

    const users = await User.find(query)
      .select('-password')
      .sort(sortField)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/users/:userId/ban', protect, isAdmin, adminEmailLimiter, async (req, res) => {
  try {
    const { banned, reason } = req.body;
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.banned = banned;
    if (banned) {
      user.bannedAt = Date.now();
      user.banReason = reason;
    } else {
      user.bannedAt = null;
      user.banReason = null;
    }
    
    await user.save();
    await redis.del(`profile:me:${user._id}`);

    try {
      const ioInstance = req.app.get('io');
      if (ioInstance) {
        const userId = req.params.userId.toString();
        if (banned) {
          ioInstance.to(userId).emit('user:banned', {
            reason: reason || 'Violation of community guidelines',
            bannedAt: user.bannedAt
          });
          // Force-disconnect every active socket for this user immediately —
          // emitting alone does not terminate the connection.
          const activeSockets = await ioInstance.in(userId).fetchSockets();
          for (const s of activeSockets) {
            s.disconnect(true);
          }
        } else {
          ioInstance.to(userId).emit('user:unbanned', {});
        }
      }
    } catch (socketError) {
      logger.error('Failed to emit ban socket event:', socketError);
    }

    try {
      const { sendBanNotificationEmail, sendUnbanNotificationEmail } = require('../utils/emailService');
      
      if (banned) {
        await sendBanNotificationEmail(user.email, user.name, reason || 'Violation of community guidelines');
      } else {
        await sendUnbanNotificationEmail(user.email, user.name);
      }
    } catch (emailError) {
      logger.error('Failed to send ban/unban notification email:', emailError);
    }

    await logAudit(req, banned ? 'BAN_USER' : 'UNBAN_USER', 'USER_MANAGEMENT', banned ? 'critical' : 'medium', user,
      banned ? `User banned. Reason: ${reason || 'Violation of community guidelines'}` : 'User ban lifted');

    res.json({
      success: true,
      message: banned ? 'User banned and notified' : 'User unbanned and notified',
      user
    });
  } catch (error) {
    logger.error('Ban user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});


router.put('/verifications/:userId', protect, isAdmin, async (req, res) => {
  try {
    const { action } = req.body;
    const user = await User.findById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (action === 'approve') {
      user.verified = true;
      user.isFaceVerified = true;
      user.verificationStatus = 'approved';
      user.verificationApprovedAt = user.verificationApprovedAt || new Date();
      user.verificationRejectionReason = null;
    } else {
      user.verificationStatus = 'rejected';
      user.isFaceVerified = false;
      user.verificationPhoto = null;
    }
    
    await user.save();
    await redis.del(`profile:me:${user._id}`);
    // Clear all discovery caches so the newly approved user surfaces immediately
    await redis.delPattern('discovery:*');

    // On approval: emit discovery:new_user to exhausted nearby users so they
    // see the new card immediately without waiting for their 2-minute poll.
    if (action === 'approve') {
      try {
        const { notifyExhaustedUsersOfNewMember } = require('../utils/discoveryNotifier');
        const freshApproved = await User.findById(user._id).lean();
        const io = req.app.get('io');
        notifyExhaustedUsersOfNewMember(freshApproved, io).catch(() => {});
      } catch (notifyErr) {
        logger.error('[Admin] notifyExhaustedUsersOfNewMember (legacy route) failed (non-fatal):', notifyErr.message);
      }
    }

    res.json({ success: true, message: `Verification ${action}d`, user });
  } catch (error) {
    logger.error('Update verification error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/appeals', protect, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Appeal message is required' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ success: false, message: 'Appeal message must be under 1000 characters' });
    }

    const user = await User.findById(req.user._id);

    if (!user.banned && !user.suspended) {
      return res.status(400).json({ success: false, message: 'You do not have an active ban or suspension to appeal' });
    }

    if (user.appeal && user.appeal.status === 'pending') {
      return res.status(400).json({ success: false, message: 'You already have a pending appeal' });
    }

    if (user.appeal && user.appeal.status === 'rejected' && user.appeal.lastAppealRejectedAt) {
      const daysSinceRejection = (Date.now() - user.appeal.lastAppealRejectedAt) / (1000 * 60 * 60 * 24);
      if (daysSinceRejection < 30) {
        const daysLeft = Math.ceil(30 - daysSinceRejection);
        return res.status(400).json({ 
          success: false, 
          message: `You can submit a new appeal in ${daysLeft} days` 
        });
      }
    }

    user.appeal = {
      status: 'pending',
      message,
      submittedAt: Date.now()
    };
    await user.save();
    await redis.del(`profile:me:${user._id}`);

    sendAdminPushNotification({
      type: 'NEW_APPEAL',
      body: `${user.name} has submitted a ban appeal and is awaiting your review.`,
      data: { tab: 'appeals' },
    }).catch(() => {});

    res.json({ success: true, message: 'Appeal submitted successfully. Admins will review it soon.' });
  } catch (error) {
    logger.error('Appeal submission error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/appeals', protect, isAdmin, async (req, res) => {
  try {
    const appeals = await User.find({ 'appeal.status': 'pending' })
      .select('name email banned suspended appeal bannedAt suspendedUntil')
      .sort({ 'appeal.submittedAt': -1 })
      .limit(100);

    res.json({ success: true, appeals });
  } catch (error) {
    logger.error('Get appeals error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/appeals/:userId', protect, isAdmin, adminEmailLimiter, async (req, res) => {
  try {
    const { action, adminResponse } = req.body; // action: 'approve', 'reject'
    
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.appeal || user.appeal.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'No pending appeal for this user' });
    }

    user.appeal.status = action === 'approve' ? 'approved' : 'rejected';
    user.appeal.reviewedAt = Date.now();
    user.appeal.reviewedBy = req.user._id;
    user.appeal.adminResponse = adminResponse || '';
    
    if (action === 'reject') {
      user.appeal.lastAppealRejectedAt = Date.now();
    }

    if (action === 'approve') {
      user.banned = false;
      user.bannedAt = null;
      user.banReason = null;
      user.suspended = false;
      user.suspendedUntil = null;
      user.messagingPaused = {
        isPaused: false,
        until: null,
        reason: null,
        autoTriggeredAt: null,
        bypassCount: 0,
      };
      user.appeal = {
        status: 'none',
        message: null,
        submittedAt: null,
        reviewedAt: Date.now(),
        reviewedBy: req.user._id,
        adminResponse: adminResponse || '',
        lastAppealRejectedAt: user.appeal.lastAppealRejectedAt || null
      };
    }

    await user.save();
    await redis.del(`profile:me:${user._id}`);

    try {
      const { sendAppealDecisionEmail } = require('../utils/emailService');
      const approved = action === 'approve';
      await sendAppealDecisionEmail(user.email, user.name, approved, adminResponse);
    } catch (emailError) {
      logger.error('Failed to send appeal decision email:', emailError);
    }

    await logAudit(req, action === 'approve' ? 'APPROVE_APPEAL' : 'REJECT_APPEAL', 'APPEAL',
      action === 'approve' ? 'high' : 'medium', user,
      `Appeal ${action}d. ${adminResponse ? 'Response: ' + adminResponse : ''}`);

    res.json({ 
      success: true, 
      message: action === 'approve' ? 'Appeal approved, user unbanned, and notified' : 'Appeal rejected and user notified',
      user 
    });
  } catch (error) {
    logger.error('Review appeal error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Lift an auto-triggered messaging pause after admin review
router.post('/users/:userId/lift-messaging-pause', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    user.messagingPaused = {
      isPaused: false,
      until: null,
      reason: null,
      autoTriggeredAt: null,
      bypassCount: 0,
    };
    await user.save();

    try {
      const ioInstance = req.app.get('io');
      if (ioInstance) {
        ioInstance.to(String(user._id)).emit('user:messaging-resumed', {});
      }
    } catch (_e) { /* non-fatal */ }

    await logAudit(req, 'LIFT_MESSAGING_PAUSE', 'USER_SAFETY', 'medium', user,
      'Admin lifted auto-triggered messaging pause');

    res.json({ success: true, message: 'Messaging pause lifted' });
  } catch (error) {
    logger.error('Lift messaging pause error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/verifications', protect, isAdmin, async (req, res) => {
  try {
    const verifications = await User.find({ 
      verificationStatus: 'pending'
    }).select('_id name email idPhoto selfiePhoto verificationVideoUrl verificationVideo verificationRequestDate photos age gender location');

    res.json({
      success: true,
      verifications
    });
  } catch (error) {
    logger.error('Get verifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/revoke-verification/:userId', protect, isAdmin, adminEmailLimiter, verificationController.revokeVerification);

router.get('/users/:userId/notifications', protect, isAdmin, async (req, res) => {
  try {
    const NotificationLog = require('../models/NotificationLog');
    const { userId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const filter = { recipient: userId };
    if (req.query.channel && ['email', 'push', 'inapp', 'socket'].includes(req.query.channel)) {
      filter.channel = req.query.channel;
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;

    const [items, total, statsAgg] = await Promise.all([
      NotificationLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      NotificationLog.countDocuments(filter),
      NotificationLog.aggregate([
        { $match: { recipient: new (require('mongoose')).Types.ObjectId(userId) } },
        {
          $group: {
            _id: { channel: '$channel', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stats = { email: { sent: 0, failed: 0 }, push: { sent: 0, failed: 0 }, total };
    statsAgg.forEach((row) => {
      const ch = row._id.channel;
      const st = row._id.status;
      if (!stats[ch]) stats[ch] = { sent: 0, failed: 0 };
      if (st === 'failed' || st === 'bounced') stats[ch].failed += row.count;
      else stats[ch].sent += row.count;
    });

    res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      stats,
      items,
    });
  } catch (error) {
    logger.error('Get user notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/verifications/:userId/approve', protect, isAdmin, adminEmailLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.verified = true;
    user.isFaceVerified = true;
    user.verificationStatus = 'approved';
    user.verificationApprovedBy = req.user._id;
    user.verificationApprovedAt = new Date();
    user.verificationRejectionReason = null;
    await user.save();
    await redis.del(`profile:me:${user._id}`);
    // Wipe every discoverer's cached `/users/nearby` result so the newly
    // approved user becomes visible to others within seconds rather than
    // waiting up to 2 minutes for the per-key TTL to expire.
    await redis.delPattern('discovery:*');

    await logAudit(req, 'APPROVE_VERIFICATION', 'VERIFICATION', 'medium', user, `ID verification approved for ${user.name}`);

    if (user.email) {
      try {
        const { sendVerificationApprovedEmail } = require('../utils/emailService');
        await sendVerificationApprovedEmail(user.email, user.name);
      } catch (emailError) {
        logger.error('Failed to send verification approved email:', emailError);
      }
    }

    try {
      if (user.pushToken && user.pushNotificationsEnabled !== false) {
        const { sendExpoPushNotification } = require('../utils/pushNotifications');
        await sendExpoPushNotification(user.pushToken, {
          title: '✅ Verification Approved!',
          body: 'Congratulations! Your face verification has been approved. You can now discover and connect with other users.',
          data: { type: 'verification_approved', screen: 'Discovery' },
          channelId: 'default',
          priority: 'high',
        });
      }
    } catch (pushError) {
      logger.error('Failed to send verification approved push notification:', pushError);
    }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(user._id.toString()).emit('user:verified', {
          userId: user._id.toString(),
          verified: true,
          verificationStatus: 'approved',
        });

        // Notify nearby users whose discovery deck is exhausted so the
        // newly verified user appears in their deck immediately via the
        // discovery:new_user socket event — no manual refresh needed.
        const { notifyExhaustedUsersOfNewMember } = require('../utils/discoveryNotifier');
        const freshUser = await User.findById(user._id).lean();
        notifyExhaustedUsersOfNewMember(freshUser, io).catch((notifyErr) => {
          logger.error('[Admin] notifyExhaustedUsersOfNewMember failed (non-fatal):', notifyErr.message);
        });
      }
    } catch (socketError) {
      logger.error('Failed to emit verification socket event:', socketError);
    }

    res.json({
      success: true,
      message: 'User verified successfully',
      user: { _id: user._id, name: user.name, email: user.email, verified: true }
    });
  } catch (error) {
    logger.error('Approval error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/verifications/:userId/reject', protect, isAdmin, adminEmailLimiter, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const rejectionReason = reason || 'Photos do not meet requirements';
    user.isFaceVerified = false;
    user.verified = false;
    user.verificationStatus = 'rejected';
    user.verificationRejectionReason = rejectionReason;
    user.verificationApprovedAt = null;
    await user.save();
    await redis.del(`profile:me:${user._id}`);

    await logAudit(req, 'REJECT_VERIFICATION', 'VERIFICATION', 'medium', user,
      `ID verification rejected. Reason: ${rejectionReason}`);

    if (user.email) {
      try {
        const { sendVerificationRejectedEmail } = require('../utils/emailService');
        await sendVerificationRejectedEmail(user.email, user.name, rejectionReason);
      } catch (emailError) {
        logger.error('Failed to send verification rejection email:', emailError);
      }
    }

    try {
      if (user.pushToken && user.pushNotificationsEnabled !== false) {
        const { sendExpoPushNotification } = require('../utils/pushNotifications');
        await sendExpoPushNotification(user.pushToken, {
          title: '❌ Verification Not Approved',
          body: `Reason: ${rejectionReason}. Please try again with a clearer video in good lighting.`,
          data: { type: 'verification_rejected', screen: 'Verification' },
          channelId: 'default',
          priority: 'high',
        });
      }
    } catch (pushError) {
      logger.error('Failed to send verification rejected push notification:', pushError);
    }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(user._id.toString()).emit('user:verification-rejected', {
          userId: user._id.toString(),
          verificationStatus: 'rejected',
          reason: rejectionReason,
        });
      }
    } catch (socketError) {
      logger.error('Failed to emit verification socket event:', socketError);
    }

    res.json({
      success: true,
      message: 'Verification rejected'
    });
  } catch (error) {
    logger.error('Rejection error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/premium-members', protect, isAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 25, search, source, plan, status, autoRenew } = req.query;
    const query = { 'premium.isActive': true };

    if (status === 'expired') {
      query['premium.isActive'] = false;
      query['premium.cancelledAt'] = { $ne: null };
    } else if (status === 'expiring_soon') {
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      query['premium.expiresAt'] = { $lte: sevenDays, $gt: new Date() };
    } else if (status === 'cancelled_active') {
      query['premium.cancelledAt'] = { $ne: null };
      query['premium.isActive'] = true;
    } else if (status === 'admin_expiring') {
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      query['premium.source'] = 'admin';
      query['premium.expiresAt'] = { $lte: sevenDays, $gt: new Date() };
    }

    if (source) query['premium.source'] = source;
    if (plan) query['premium.plan'] = plan;
    if (autoRenew === 'true') query['premium.autoRenewing'] = true;
    if (autoRenew === 'false') query['premium.autoRenewing'] = false;

    if (search) {
      const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { 'premium.originalTransactionId': search },
        { 'premium.purchaseToken': search }
      ];
    }

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const [members, total, summaryAgg] = await Promise.all([
      User.find(query)
        .select('name email avatar premium createdAt')
        .sort({ 'premium.expiresAt': 1 })
        .limit(limitNum)
        .skip((pageNum - 1) * limitNum)
        .lean(),
      User.countDocuments(query),
      (() => {
        const now = new Date();
        const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return User.aggregate([
          { $match: { 'premium.isActive': true } },
          {
            $group: {
              _id: null,
              totalActive: { $sum: 1 },
              ios: { $sum: { $cond: [{ $eq: ['$premium.source', 'ios'] }, 1, 0] } },
              android: { $sum: { $cond: [{ $eq: ['$premium.source', 'android'] }, 1, 0] } },
              web: { $sum: { $cond: [{ $eq: ['$premium.source', 'web'] }, 1, 0] } },
              admin: { $sum: { $cond: [{ $eq: ['$premium.source', 'admin'] }, 1, 0] } },
              cancelledButActive: { $sum: { $cond: [{ $ne: ['$premium.cancelledAt', null] }, 1, 0] } },
              autoRenewOff: { $sum: { $cond: [{ $eq: ['$premium.autoRenewing', false] }, 1, 0] } },
              adminGrantsExpiringSoon: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$premium.source', 'admin'] },
                        { $gte: ['$premium.expiresAt', now] },
                        { $lte: ['$premium.expiresAt', sevenDays] }
                      ]
                    },
                    1, 0
                  ]
                }
              }
            }
          }
        ]);
      })()
    ]);

    res.json({
      success: true,
      members,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      },
      summary: summaryAgg[0] || {
        totalActive: 0, ios: 0, android: 0, web: 0, admin: 0,
        cancelledButActive: 0, autoRenewOff: 0, adminGrantsExpiringSoon: 0
      }
    });
  } catch (error) {
    logger.error('Premium members error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Grant a user free Premium access (admin comp / VIP / influencer / refund credit etc.)
// POST /admin/users/:userId/grant-premium  { durationDays: number, reason?: string }
// Emorii has a single Premium tier — only the duration is configurable.
const { PREMIUM_FEATURES } = require('../services/iapWebhookService');
router.post('/users/:userId/grant-premium', protect, isAdmin, async (req, res) => {
  try {
    const { durationDays = 30, reason } = req.body || {};
    const days = Math.max(1, Math.min(3650, parseInt(durationDays, 10) || 30));

    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const now = new Date();
    // If already active, extend from current expiry; otherwise from now.
    const currentExpiry = user.premium?.expiresAt ? new Date(user.premium.expiresAt) : null;
    const baseDate = user.premium?.isActive && currentExpiry && currentExpiry > now ? currentExpiry : now;
    const expiresAt = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    // All paid users get the same feature set — see iapWebhookService.PREMIUM_FEATURES.
    const features = {
      ...PREMIUM_FEATURES,
      voiceNoteLimit: 30,
      unsendLimit: 15,
    };

    user.premium = {
      ...(user.premium?.toObject ? user.premium.toObject() : user.premium || {}),
      isActive: true,
      plan: 'admin_grant',
      source: 'admin',
      productId: 'admin_grant',
      expiresAt,
      activatedAt: user.premium?.activatedAt || now,
      cancelledAt: null,
      autoRenewing: false,
      lastEventType: 'ADMIN_GRANT',
      lastEventAt: now,
      features,
      adminGrantReason: reason ? String(reason).slice(0, 500) : null,
      // Reset so a future expiry warning email goes out for the new expiry date.
      adminGrantExpiryWarningSentAt: null,
    };

    await user.save();
    if (redis?.del) {
      await redis.del(`profile:me:${user._id}`).catch(() => {});
    }

    await logAudit(
      req,
      'GRANT_PREMIUM',
      'SUBSCRIPTION',
      'high',
      user,
      `Granted Premium for ${days} days (until ${expiresAt.toISOString()})${reason ? ` — ${reason}` : ''}`
    );

    res.json({
      success: true,
      message: `Premium granted for ${days} days`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        premium: user.premium,
      },
    });
  } catch (error) {
    logger.error('Grant premium error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Revoke a previously-granted free premium (only valid when source==='admin').
router.post('/users/:userId/revoke-premium', protect, isAdmin, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.premium?.source && user.premium.source !== 'admin') {
      return res.status(400).json({
        success: false,
        message: `Cannot revoke a paid subscription (source: ${user.premium.source}). Use the store cancellation flow instead.`,
      });
    }

    const now = new Date();
    user.premium = {
      ...(user.premium?.toObject ? user.premium.toObject() : user.premium || {}),
      isActive: false,
      plan: 'free',
      expiresAt: now,
      cancelledAt: now,
      autoRenewing: false,
      lastEventType: 'ADMIN_REVOKE',
      lastEventAt: now,
      features: {
        unlimitedSwipes: false,
        seeWhoLikesYou: false,
        unlimitedRewinds: false,
        boostPerMonth: 0,
        superLikesPerDay: 0,
        noAds: false,
        advancedFilters: false,
        readReceipts: false,
        priorityMatches: false,
        incognitoMode: false,
        voiceNoteLimit: 30,
        unsendLimit: 15,
      },
    };

    await user.save();
    if (redis?.del) {
      await redis.del(`profile:me:${user._id}`).catch(() => {});
    }

    await logAudit(
      req,
      'REVOKE_PREMIUM',
      'SUBSCRIPTION',
      'high',
      user,
      `Revoked admin-granted premium${reason ? ` — ${reason}` : ''}`
    );

    res.json({
      success: true,
      message: 'Premium revoked',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        premium: user.premium,
      },
    });
  } catch (error) {
    logger.error('Revoke premium error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Lightweight user lookup for the "Grant Premium" admin modal.
// GET /admin/users/lookup?q=email_or_name
router.get('/users/lookup', protect, isAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ success: true, users: [] });

    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safe = escape(q);
    const users = await User.find({
      $or: [
        { email: { $regex: safe, $options: 'i' } },
        { name: { $regex: safe, $options: 'i' } },
      ],
    })
      .select('name email avatar premium')
      .limit(10)
      .lean();

    res.json({ success: true, users });
  } catch (error) {
    logger.error('User lookup error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/subscriptions-revenue', protect, isAdmin, async (req, res) => {
  try {
    const activeSubscriptions = await User.countDocuments({ 'premium.isActive': true });
    const premiumPlans = await User.find({ 'premium.isActive': true }).select('premium name');
    
    const plansBreakdown = {};
    premiumPlans.forEach(u => {
      const plan = u.premium?.plan || 'unknown';
      plansBreakdown[plan] = (plansBreakdown[plan] || 0) + 1;
    });

    res.json({
      success: true,
      subscriptions: {
        totalActive: activeSubscriptions,
        plansBreakdown,
        estimatedMonthlyRevenue: activeSubscriptions * 15
      }
    });
  } catch (error) {
    logger.error('Subscription error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/stories-moderation', protect, isAdmin, async (req, res) => {
  try {
    const Story = require('../models/Story');
    const flaggedStories = await Story.find({ flagged: true })
      .populate('userId', 'name email')
      .limit(50)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      flaggedStories: flaggedStories || [],
      totalFlagged: flaggedStories?.length || 0
    });
  } catch (error) {
    logger.error('Stories moderation error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/boosts-revenue', protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('boosts premium');
    let totalBoosts = 0;
    let usersWithBoosts = 0;

    users.forEach(u => {
      if (u.boosts && u.boosts > 0) {
        totalBoosts += u.boosts;
        usersWithBoosts++;
      }
    });

    res.json({
      success: true,
      boosts: {
        totalBoostsIssued: totalBoosts,
        usersWithBoosts,
        estimatedBoostRevenue: usersWithBoosts * 5
      }
    });
  } catch (error) {
    logger.error('Boosts error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const stats = await withCache('admin:stats', OVERVIEW_TTL_SECONDS, computeStats);
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Explicit exclusion of sensitive fields the admin UI doesn't need.
// Using exclusion (not inclusion) so newly-added schema fields are included by default.
// Fields excluded: raw device tokens (can send arbitrary pushes), full receipt blobs,
// Spotify OAuth tokens, and large swipe/block arrays (memory + leakage risk).
const ADMIN_USER_PROJECTION = '-password -pushToken -fcmToken -voipPushToken -premium.receipt -spotify.accessToken -spotify.refreshToken -swipedRight -swipedLeft -superLiked -blockedUsers';

router.get('/proxy-profile/:userId', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(ADMIN_USER_PROJECTION);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/users/:userId', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(ADMIN_USER_PROJECTION);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    logger.error('Get user detail error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/stories/:storyId', protect, isAdmin, async (req, res) => {
  try {
    const Story = require('../models/Story');
    const story = await Story.findById(req.params.storyId);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    await Story.findByIdAndDelete(req.params.storyId);
    res.json({ success: true, message: 'Story removed successfully' });
  } catch (error) {
    logger.error('Delete story error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/users/:userId/suspend', protect, isAdmin, async (req, res) => {
  try {
    const { suspended, days = 7 } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.suspended = suspended;
    if (suspended) {
      user.suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    } else {
      user.suspendedUntil = null;
    }
    await user.save();

    try {
      const ioInstance = req.app.get('io');
      if (ioInstance) {
        const userId = req.params.userId.toString();
        if (suspended) {
          ioInstance.to(userId).emit('user:suspended', {
            suspendedUntil: user.suspendedUntil,
            days
          });
        } else {
          ioInstance.to(userId).emit('user:unsuspended', {});
        }
      }
    } catch (socketError) {
      logger.error('Failed to emit suspend socket event:', socketError);
    }

    await logAudit(req, suspended ? 'SUSPEND_USER' : 'UNSUSPEND_USER', 'USER_MANAGEMENT', 'high', user,
      suspended ? `User suspended for ${days} days` : 'User suspension lifted');

    res.json({
      success: true,
      message: suspended ? `User suspended for ${days} days` : 'User suspension lifted',
      user,
    });
  } catch (error) {
    logger.error('Suspend user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/users/:userId', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    await logAudit(req, 'DELETE_USER', 'USER_MANAGEMENT', 'critical', user, `User account permanently deleted: ${user.name} (${user.email})`);
    await User.findByIdAndDelete(req.params.userId);
    res.json({ success: true, message: 'User account permanently deleted' });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/flagged-content', protect, isAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    const FLAGGABLE_TYPES = [
      'profile_photo', 'story', 'message_image', 'message_text', 'message_audio',
      'message_video', 'voice_bio', 'success_story', 'bio', 'comment'
    ];
    const [reports, safetyAudits] = await Promise.all([
      Report.find({ status: 'pending', contentType: { $in: FLAGGABLE_TYPES } })
        .populate('reportedBy', 'name email photos')
        .populate('reporter', 'name email photos')
        .populate('reportedUser', 'name email photos')
        .sort({ createdAt: -1 })
        .limit(100),
      AuditLog.find({ action: 'SAFETY_WARNING_BYPASSED' })
        .populate('adminId', 'name email photos')
        .sort({ createdAt: -1 })
        .limit(50),
    ]);

    const VISUAL_TYPES = ['profile_photo', 'story', 'message_image', 'success_story'];
    const reportContent = reports
      .map(report => {
        const reportedUser = report.reportedUser;
        const reporter = report.reportedBy || report.reporter;
        if (!reportedUser) return null;
        const userAvatar = reportedUser.photos?.[0]?.url || reportedUser.photos?.[0];
        let imageUrl = report.contentUrl || (VISUAL_TYPES.includes(report.contentType) ? userAvatar : null);
        if (report.contentType === 'profile_photo' && !imageUrl) {
          const photoIndex = Number.parseInt(report.contentId || '0', 10);
          const photo = reportedUser.photos?.[photoIndex] || reportedUser.photos?.[0];
          imageUrl = photo?.url || photo;
        }

        return {
          id: `report-${report._id}`,
          reportId: report._id,
          userId: reportedUser._id,
          userName: reportedUser.name || 'Unknown user',
          userAvatar,
          type: report.contentType,
          imageUrl,
          contentUrl: report.contentUrl,
          contentPreview: report.contentPreview,
          contentMeta: report.contentMeta,
          reason: `${report.reason || 'Reported content'}${report.description ? `: ${report.description}` : ''}${reporter?.name ? ` • reported by ${reporter.name}` : ''}`,
          flaggedAt: report.createdAt || new Date(),
          status: 'pending',
          aiConfidence: 60,
        };
      })
      .filter(Boolean);

    const safetyContent = safetyAudits.map(audit => {
      const sender = audit.adminId;
      const reasons = audit.metadata?.reasons || [];
      const userAvatar = sender?.photos?.[0]?.url || sender?.photos?.[0] || null;
      return {
        id: `safety-${audit._id}`,
        auditId: audit._id,
        userId: sender?._id || audit.adminId,
        userName: audit.adminName || sender?.name || 'Unknown user',
        userAvatar,
        type: 'safety_bypass',
        imageUrl: null,
        contentPreview: audit.details || '',
        reason: `Safety warning bypassed: ${reasons.join(', ') || 'unknown reasons'}`,
        flaggedAt: audit.createdAt || new Date(),
        status: 'pending',
        severity: audit.severity,
        aiConfidence: audit.severity === 'high' ? 85 : 50,
      };
    });

    const content = [...reportContent, ...safetyContent].sort(
      (a, b) => new Date(b.flaggedAt).getTime() - new Date(a.flaggedAt).getTime()
    );

    const filtered = status ? content.filter(c => c.status === status) : content;

    res.json({ success: true, content: filtered, total: filtered.length });
  } catch (error) {
    logger.error('Flagged content error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/flagged-content/:contentId', protect, isAdmin, async (req, res) => {
  try {
    const { action } = req.body; // 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    if (req.params.contentId.startsWith('safety-')) {
      const auditId = req.params.contentId.replace('safety-', '');
      const audit = await AuditLog.findById(auditId);
      if (!audit) {
        return res.status(404).json({ success: false, message: 'Safety audit record not found' });
      }
      if (action === 'reject') {
        const targetUser = await User.findById(audit.adminId);
        if (targetUser) {
          const suspendUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          targetUser.isBanned = true;
          targetUser.bannedAt = new Date();
          targetUser.banReason = 'Suspended by moderation after safety warning bypass review';
          targetUser.suspendedUntil = suspendUntil;
          await targetUser.save();
          const io = req.app.get('io');
          if (io) {
            io.to(String(targetUser._id)).emit('user:suspended', {
              days: 7,
              reason: 'Your account has been suspended after a safety review.',
              suspendedUntil: suspendUntil,
            });
          }
        }
      }
      await logAudit(req, action === 'reject' ? 'SAFETY_ACTION_TAKEN' : 'SAFETY_DISMISSED', 'USER_SAFETY',
        action === 'reject' ? 'high' : 'low', null,
        `Safety bypass ${action}d. Audit ID: ${auditId}`);
      return res.json({ success: true, message: action === 'approve' ? 'Safety event dismissed' : 'User suspended for safety violation', contentId: req.params.contentId, action });
    }

    if (req.params.contentId.startsWith('report-')) {
      const reportId = req.params.contentId.replace('report-', '');
      const report = await Report.findById(reportId);
      if (!report) {
        return res.status(404).json({ success: false, message: 'Flagged report not found' });
      }

      const reportedUserId = report.reportedUser?._id || report.reportedUser;
      const user = await User.findById(reportedUserId);
      if (action === 'reject') {
        if (report.contentType === 'profile_photo' && user) {
          let photoIndex = Number.parseInt(report.contentId || '', 10);
          if (!Number.isInteger(photoIndex) || !user.photos?.[photoIndex]) {
            photoIndex = user.photos?.findIndex(photo => (photo?.url || photo) === report.contentUrl) ?? -1;
          }
          if (photoIndex >= 0 && user.photos?.[photoIndex]) {
            user.photos.splice(photoIndex, 1);
            await user.save();
            await redis.del(`profile:me:${user._id}`);
          }
        } else if (report.contentType === 'story' && report.contentId) {
          const story = await Story.findById(report.contentId);
          if (story) {
            const ownerId = story.user.toString();
            await story.deleteOne();
            await Promise.all([
              redis.del(`stories:active:${ownerId}`),
              redis.del(`stories:mine:${ownerId}`),
              redis.del(`stories:user:${ownerId}:viewer:${ownerId}`),
            ]);
          }
        } else if (['message_image', 'message_text', 'message_audio', 'message_video'].includes(report.contentType) && report.contentId) {
          const message = await Message.findById(report.contentId);
          if (message) {
            message.content = 'This message was removed by moderation';
            message.type = 'system';
            message.imageUrl = undefined;
            message.audioUrl = undefined;
            message.videoUrl = undefined;
            message.deletedForEveryone = true;
            await message.save();
            const io = req.app.get('io');
            if (io) {
              io.to(message.matchId.toString()).emit('chat:message-deleted', {
                messageId: message._id,
                matchId: message.matchId,
              });
            }
          }
        } else if (report.contentType === 'voice_bio' && user) {
          if (user.voiceBio?.url) {
            user.voiceBio = { url: null, publicId: null };
            await user.save();
            await redis.del(`profile:me:${user._id}`);
          }
        } else if (report.contentType === 'bio' && user) {
          if (user.bio) {
            user.bio = '';
            await user.save();
            await redis.del(`profile:me:${user._id}`);
          }
        } else if (report.contentType === 'success_story' && report.contentId) {
          const SuccessStory = require('../models/SuccessStory');
          const story = await SuccessStory.findById(report.contentId);
          if (story) {
            story.status = 'rejected';
            story.rejectionReason = 'Removed by moderation following community report';
            story.featured = false;
            await story.save();
          }
        }
      }

      report.status = 'resolved';
      report.resolvedBy = req.user._id;
      report.resolvedAt = Date.now();
      report.adminNotes = action === 'approve' ? 'Content reviewed and kept' : 'Flagged content removed';
      await report.save();
    }

    await logAudit(req, action === 'reject' ? 'REMOVE_CONTENT' : 'APPROVE_CONTENT', 'MODERATION',
      action === 'reject' ? 'medium' : 'low', null,
      `Flagged content ${action}d. Content ID: ${req.params.contentId}`);

    res.json({
      success: true,
      message: action === 'approve' ? 'Content approved' : 'Content rejected and removed',
      contentId: req.params.contentId,
      action,
    });
  } catch (error) {
    logger.error('Moderate content error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const BroadcastLog = require('../models/BroadcastLog');

router.get('/broadcasts', protect, isAdmin, async (req, res) => {
  try {
    const broadcasts = await BroadcastLog.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, broadcasts });
  } catch (error) {
    logger.error('Get broadcasts error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/broadcasts', protect, isAdmin, async (req, res) => {
  try {
    const { sendSmartNotification } = require('../utils/pushNotifications');
    const { title, body, target = 'all', imageUrl, scheduled = false } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required' });
    }

    let audienceQuery = { pushToken: { $exists: true, $ne: null }, pushNotificationsEnabled: { $ne: false } };
    if (target === 'male' || target === 'female') audienceQuery.gender = target;
    if (target === 'verified') audienceQuery.verified = true;
    if (target === 'platinum') audienceQuery['premium.plan'] = 'platinum';
    if (target === 'gold') audienceQuery['premium.plan'] = 'gold';

    const users = await User.find(audienceQuery)
      .select('pushToken pushNotificationsEnabled muteSettings notificationPreferences')
      .lean();

    const reach = users.length;
    const broadcastId = `bc-${Date.now()}`;

    const logEntry = await BroadcastLog.create({
      broadcastId,
      title,
      body,
      target,
      imageUrl: imageUrl || null,
      status: scheduled ? 'scheduled' : 'sent',
      sentBy: req.user._id,
      reach,
      openRate: '0%',
    });

    const campaign = logEntry.toObject();
    campaign.id = campaign.broadcastId;
    campaign.sentAt = campaign.createdAt;

    await logAudit(req, 'SEND_BROADCAST', 'BROADCAST', 'high', null,
      `Broadcast sent: "${title}". Target: ${target}. Reach: ${reach} users.`,
      { title, body, target, reach, scheduled });

    res.json({ success: true, message: 'Broadcast dispatched successfully', campaign });

    if (!scheduled) {
      setImmediate(async () => {
        const Notification = require('../models/Notification');
        let sent = 0;
        for (const user of users) {
          try {
            const ok = await sendSmartNotification(
              user,
              {
                title,
                body,
                data: { type: 'broadcast', screen: 'Home' },
                channelId: 'default',
              },
              'system',
            );
            if (ok) sent++;
            await Notification.create({
              recipient: user._id,
              type: 'system',
              title,
              body,
              data: { type: 'broadcast', screen: 'Home' },
            });
          } catch (e) {
            logger.error('[Broadcast] Push error for user', user._id, e.message);
          }
        }
        await BroadcastLog.findByIdAndUpdate(logEntry._id, { actualSent: sent });
        logger.log(`[Broadcast] "${title}" — sent ${sent}/${reach} notifications`);
      });
    }
  } catch (error) {
    logger.error('Send broadcast error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const AppSettings = require('../models/AppSettings');

// In-memory cache — loaded from DB on first request, kept in sync on every PUT.
// This preserves the fast synchronous `router.getSettings()` used by the kill-switch
// middleware, while ensuring persistence across restarts.
let appSettings = {
  appName: 'Emorii',
  maintenanceMode: false,
  maxDailySwipes: 50,
  maxPhotos: 9,
  minAge: 18,
  maxAge: 65,
  matchingRadius: 100,
  premiumMatchBoost: 3,
  allowGuestBrowsing: false,
  requireEmailVerification: true,
  aiModerationEnabled: true,
  reportThreshold: 5,
  signupBonusCoins: 100,
};

// Load persisted settings from DB at startup (non-blocking)
AppSettings.getSettings()
  .then(saved => { appSettings = { ...appSettings, ...saved }; })
  .catch(err => logger.warn('[AppSettings] Could not load from DB on startup (non-fatal):', err.message));

router.get('/settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AppSettings.getSettings();
    appSettings = { ...appSettings, ...settings };
    res.json({ success: true, settings: appSettings });
  } catch (error) {
    logger.error('Get settings error:', error);
    res.json({ success: true, settings: appSettings });
  }
});

router.put('/settings', protect, isAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const saved = await AppSettings.updateSettings(updates);
    appSettings = { ...appSettings, ...saved };
    res.json({ success: true, message: 'Settings updated successfully', settings: appSettings });
  } catch (error) {
    logger.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/analytics', protect, isAdmin, async (req, res) => {
  try {
    const now = new Date();
    const period = req.query.period === '30d' ? '30d' : '7d';
    const dayCount = period === '30d' ? 30 : 7;

    const days = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end   = new Date(d); end.setHours(23, 59, 59, 999);

      const [newUsers, activeUsers] = await Promise.all([
        User.countDocuments({ createdAt:  { $gte: start, $lte: end } }),
        User.countDocuments({ lastActive: { $gte: start, $lte: end } }),
      ]);

      days.push({
        name: period === '30d'
          ? start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : start.toLocaleDateString('en-US', { weekday: 'short' }),
        newUsers,
        active:   activeUsers,
        matches:  Math.floor(activeUsers * 0.25),
        messages: Math.floor(activeUsers * 2.1),
      });
    }

    const [totalUsers, verifiedUsers, premiumUsers, totalMatches] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ verified: true }),
      User.countDocuments({ 'premium.isActive': true }),
      Match.countDocuments({ status: 'active' }),
    ]);

    let profileViewsMonth = 0;
    try {
      const Activity = require('../models/Activity');
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      profileViewsMonth = await Activity.countDocuments({ type: 'profile_view', timestamp: { $gte: startOfMonth } });
    } catch (_) { /* Activity model may not exist in all deployments */ }

    const avgMatchRate = totalUsers > 0 ? ((totalMatches / totalUsers) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      analytics: {
        dailyData: days,
        totals: { totalUsers, verifiedUsers, premiumUsers },
        profileViewsMonth,
        totalMatches,
        avgMatchRate,
      },
    });
  } catch (error) {
    logger.error('Analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/activity-monitoring', protect, isAdmin, async (req, res) => {
  try {
    // L-6: Pass live socket count for exact onlineNow metric.
    const activity = await withCache('admin:activity', OVERVIEW_TTL_SECONDS,
      () => computeActivity(req.app.get('onlineUsers')?.size ?? null));
    res.json({ success: true, activity });
  } catch (error) {
    logger.error('Activity monitoring error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/user-demographics', protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find({}, 'gender age');
    const genderMap = {};
    const ageBuckets = { '18-24': 0, '25-34': 0, '35-44': 0, '45+': 0 };
    const normalizeGender = (gender) => {
      const value = String(gender || 'other').trim().toLowerCase();
      if (['male', 'man', 'men', 'm'].includes(value)) return 'male';
      if (['female', 'woman', 'women', 'f'].includes(value)) return 'female';
      if (['non-binary', 'nonbinary', 'non binary', 'nb'].includes(value)) return 'non-binary';
      return 'other';
    };

    users.forEach(u => {
      const g = normalizeGender(u.gender);
      genderMap[g] = (genderMap[g] || 0) + 1;
      const a = u.age || 0;
      if (a >= 18 && a <= 24) ageBuckets['18-24']++;
      else if (a <= 34) ageBuckets['25-34']++;
      else if (a <= 44) ageBuckets['35-44']++;
      else if (a >= 45) ageBuckets['45+']++;
    });

    const genderLabels = { male: 'Male', female: 'Female', 'non-binary': 'Non-binary', other: 'Other' };
    const genderData = Object.entries(genderMap).map(([name, value]) => ({ name: genderLabels[name] || name, value }));
    const ageData = Object.entries(ageBuckets).map(([name, value]) => ({ name, value }));

    res.json({ success: true, demographics: { genderData, ageData, total: users.length } });
  } catch (error) {
    logger.error('Demographics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/revenue-history', protect, isAdmin, async (req, res) => {
  try {
    const now = new Date();
    const days = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end   = new Date(d.setHours(23, 59, 59, 999));

      const newPremium = await User.countDocuments({
        'premium.isActive': true,
        'premium.startedAt': { $gte: start, $lte: end },
      });
      const revenue = newPremium * 15;

      days.push({
        date: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue,
        subscriptions: newPremium,
      });
    }

    res.json({ success: true, revenueHistory: days });
  } catch (error) {
    logger.error('Revenue history error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


const SupportTicket = require('../models/SupportTicket');
const { sendExpoPushNotification, sendSmartNotification } = require('../utils/pushNotifications');

router.get('/support-tickets', protect, isAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const tickets = await SupportTicket.find(query)
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, tickets });
  } catch (error) {
    logger.error('Get support tickets error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/support-tickets/:ticketId/reply', protect, isAdmin, adminEmailLimiter, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Reply content is required' });
    }

    const ticket = await SupportTicket.findById(req.params.ticketId);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const adminMessage = {
      role: 'admin',
      content: content.trim(),
      adminName: req.user?.name || 'Emorii Support',
      timestamp: new Date(),
    };
    ticket.messages.push(adminMessage);
    ticket.status = 'in-progress';
    await ticket.save();

    if (ticket.userId) {
      try {
        const user = await User.findById(ticket.userId).select(
          'pushToken pushNotificationsEnabled muteSettings notificationPreferences'
        );
        if (user?.pushToken) {
          await sendSmartNotification(user, {
            title: '💬 Support Reply from Emorii',
            body: content.length > 80 ? content.substring(0, 80) + '...' : content,
            data: { screen: 'Support', ticketId: ticket._id.toString() },
            channelId: 'support',
          }, 'support');
        }
      } catch (pushErr) {
        logger.error('Push notification failed (non-critical):', pushErr.message);
      }
    }

    if (ticket.userId) {
      try {
        const ticketUser = await User.findById(ticket.userId).select('email name');
        if (ticketUser?.email) {
          const { sendSupportReplyEmail } = require('../utils/emailService');
          await sendSupportReplyEmail(
            ticketUser.email,
            ticketUser.name,
            content.trim(),
            ticket.subject || null
          );
        }
      } catch (emailErr) {
        logger.error('Support reply email error (non-critical):', emailErr.message);
      }
    }

    res.json({ success: true, message: 'Reply sent', ticket });
  } catch (error) {
    logger.error('Support reply error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/support-tickets/:ticketId/status', protect, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['open', 'in-progress', 'closed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.ticketId,
      {
        status,
        ...(status === 'closed' ? { resolvedAt: new Date(), resolvedBy: req.user._id } : {}),
      },
      { new: true }
    );

    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    res.json({ success: true, ticket });
  } catch (error) {
    logger.error('Update ticket status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/kill-switch', protect, isAdmin, async (req, res) => {
  try {
    appSettings.maintenanceMode = true;
    await AppSettings.updateSettings({ maintenanceMode: true }).catch(
      err => logger.warn('[kill-switch] DB persist failed (non-critical):', err.message)
    );

    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        action: 'KILL_SWITCH_ACTIVATED',
        performedBy: req.user._id,
        details: { activatedAt: new Date().toISOString(), ip: req.ip },
      });
    } catch (auditErr) { logger.warn('[kill-switch] Audit log failed (non-critical):', auditErr.message); }

    logger.warn(`[KILL-SWITCH] Activated by admin ${req.user._id} at ${new Date().toISOString()}`);

    return res.json({
      success: true,
      message: 'Kill switch activated — platform is now in maintenance mode.',
      maintenanceMode: true,
    });
  } catch (error) {
    logger.error('[kill-switch] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to activate kill switch' });
  }
});

router.post('/kill-switch/deactivate', protect, isAdmin, async (req, res) => {
  try {
    appSettings.maintenanceMode = false;
    await AppSettings.updateSettings({ maintenanceMode: false }).catch(
      err => logger.warn('[kill-switch] DB persist failed (non-critical):', err.message)
    );

    try {
      const AuditLog = require('../models/AuditLog');
      await AuditLog.create({
        action: 'KILL_SWITCH_DEACTIVATED',
        performedBy: req.user._id,
        details: { deactivatedAt: new Date().toISOString() },
      });
    } catch (auditErr) { logger.warn('[kill-switch] Audit log failed (non-critical):', auditErr.message); }

    logger.log(`[KILL-SWITCH] Deactivated by admin ${req.user._id}`);

    return res.json({
      success: true,
      message: 'Kill switch deactivated — platform restored to normal operation.',
      maintenanceMode: false,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to deactivate kill switch' });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
 * FCM TOKEN HEALTH
 * GET  /api/admin/push/fcm-health  — token presence stats + staleness buckets
 * DELETE /api/admin/push/fcm-stale — bulk-wipe tokens from inactive accounts
 * ───────────────────────────────────────────────────────────────────────── */
router.get('/push/fcm-health', protect, isAdmin, async (req, res) => {
  try {
    const now = new Date();

    const [
      totalUsers,
      withToken,
      stale30d,
      stale60d,
      stale90d,
      activeWithoutToken,
    ] = await Promise.all([
      User.countDocuments({ isActive: true, banned: false }),
      User.countDocuments({ isActive: true, banned: false, fcmToken: { $exists: true, $nin: [null, ''] } }),
      User.countDocuments({
        isActive: true, banned: false,
        fcmToken: { $exists: true, $nin: [null, ''] },
        lastActive: { $lt: new Date(now - 30 * 24 * 60 * 60 * 1000) },
      }),
      User.countDocuments({
        isActive: true, banned: false,
        fcmToken: { $exists: true, $nin: [null, ''] },
        lastActive: { $lt: new Date(now - 60 * 24 * 60 * 60 * 1000) },
      }),
      User.countDocuments({
        isActive: true, banned: false,
        fcmToken: { $exists: true, $nin: [null, ''] },
        lastActive: { $lt: new Date(now - 90 * 24 * 60 * 60 * 1000) },
      }),
      User.countDocuments({
        isActive: true, banned: false,
        $or: [
          { fcmToken: { $exists: false } },
          { fcmToken: null },
          { fcmToken: '' },
        ],
        lastActive: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    const withoutToken = totalUsers - withToken;
    const coveragePct = totalUsers > 0 ? Math.round((withToken / totalUsers) * 100) : 0;

    return res.json({
      success: true,
      stats: {
        totalActiveUsers:    totalUsers,
        withToken,
        withoutToken,
        coveragePct,
        staleTokens: {
          over30Days: stale30d,
          over60Days: stale60d,
          over90Days: stale90d,
        },
        activeUsersWithoutToken: activeWithoutToken,
      },
    });
  } catch (error) {
    logger.error('[FCM Health] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch FCM health stats' });
  }
});

router.delete('/push/fcm-stale', protect, isAdmin, async (req, res) => {
  try {
    const { daysInactive = 90 } = req.query;
    const days = Math.max(1, parseInt(daysInactive, 10) || 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await User.updateMany(
      {
        fcmToken: { $exists: true, $ne: null, $ne: '' },
        lastActive: { $lt: cutoff },
      },
      { $unset: { fcmToken: '' } },
    );

    await logAudit(req, 'FCM_STALE_TOKENS_CLEARED', 'system', 'low', null,
      `Cleared FCM tokens for ${result.modifiedCount} users inactive for ${days}+ days`);

    logger.log(`[FCM Health] Cleared ${result.modifiedCount} stale tokens (>${days}d inactive)`);

    return res.json({
      success: true,
      cleared: result.modifiedCount,
      message: `Cleared FCM tokens from ${result.modifiedCount} accounts inactive for ${days}+ days`,
    });
  } catch (error) {
    logger.error('[FCM Health] Delete error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to clear stale FCM tokens' });
  }
});

// PUT /api/admin/profile — update the authenticated admin's own display name / avatar
router.put('/profile', protect, isAdmin, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const updates = {};
    if (name && typeof name === 'string' && name.trim()) updates.name = name.trim().slice(0, 100);
    if (avatar && typeof avatar === 'string') updates.avatar = avatar.slice(0, 5000);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields provided' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'Admin user not found' });

    await logAudit(req, 'UPDATE_ADMIN_PROFILE', 'USER_MANAGEMENT', 'low', user, `Admin updated their own profile`);

    res.json({ success: true, message: 'Profile updated', user });
  } catch (error) {
    logger.error('Update admin profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/recent-activity — last 30 audit log entries for the live activity feed
router.get('/recent-activity', protect, isAdmin, async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
    const entries = await AuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('action category severity adminName targetUserName details createdAt')
      .lean();
    res.json({ success: true, activity: entries });
  } catch (error) {
    logger.error('Recent activity error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.getSettings = () => appSettings;

module.exports = router;
