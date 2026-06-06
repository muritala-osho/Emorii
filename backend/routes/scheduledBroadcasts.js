const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const ScheduledBroadcast = require('../models/ScheduledBroadcast');
const { protect } = require('../middleware/auth');

const isAdmin = async (req, res, next) => {
  if (!req.user || (!req.user.isAdmin && !req.user.isSupportAgent)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};
const { logAudit } = require('../utils/auditHelper');

router.get('/', protect, isAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = {};
    if (status && status !== 'all') query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [broadcasts, total] = await Promise.all([
      ScheduledBroadcast.find(query)
        .sort({ scheduledAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ScheduledBroadcast.countDocuments(query),
    ]);

    res.json({
      success: true,
      broadcasts,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    logger.error('List scheduled broadcasts error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', protect, isAdmin, async (req, res) => {
  try {
    const { title, body, imageUrl, target, scheduledAt } = req.body;

    if (!title || !body || !scheduledAt) {
      return res.status(400).json({ success: false, message: 'title, body, and scheduledAt are required.' });
    }

    const fireAt = new Date(scheduledAt);
    if (isNaN(fireAt.getTime()) || fireAt <= new Date()) {
      return res.status(400).json({ success: false, message: 'scheduledAt must be a valid future date.' });
    }

    const broadcast = await ScheduledBroadcast.create({
      title,
      body,
      imageUrl: imageUrl || null,
      target: target || 'all',
      scheduledAt: fireAt,
      createdBy: req.user._id,
      createdByName: req.user.name || req.user.email,
    });

    await logAudit({
      action: 'SCHEDULE_BROADCAST',
      category: 'BROADCAST',
      severity: 'medium',
      adminId: req.user._id,
      adminName: req.user.name || req.user.email,
      adminEmail: req.user.email,
      details: `Broadcast "${title}" scheduled for ${fireAt.toISOString()} → ${target || 'all'} segment`,
      metadata: { broadcastId: broadcast._id, scheduledAt: fireAt, target },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, broadcast });
  } catch (err) {
    logger.error('Schedule broadcast error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', protect, isAdmin, async (req, res) => {
  try {
    const broadcast = await ScheduledBroadcast.findById(req.params.id);
    if (!broadcast) return res.status(404).json({ success: false, message: 'Not found.' });
    if (broadcast.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending broadcasts can be cancelled.' });
    }

    broadcast.status = 'cancelled';
    broadcast.cancelledAt = new Date();
    broadcast.cancelledByName = req.user.name || req.user.email;
    await broadcast.save();

    await logAudit({
      action: 'CANCEL_BROADCAST',
      category: 'BROADCAST',
      severity: 'medium',
      adminId: req.user._id,
      adminName: req.user.name || req.user.email,
      adminEmail: req.user.email,
      details: `Scheduled broadcast "${broadcast.title}" cancelled before fire time`,
      metadata: { broadcastId: broadcast._id },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Broadcast cancelled.' });
  } catch (err) {
    logger.error('Cancel broadcast error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/fire', protect, isAdmin, async (req, res) => {
  try {
    const broadcast = await ScheduledBroadcast.findById(req.params.id);
    if (!broadcast) return res.status(404).json({ success: false, message: 'Not found.' });
    if (broadcast.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending broadcasts can be fired.' });
    }

    broadcast.status = 'fired';
    broadcast.firedAt = new Date();
    await broadcast.save();

    await logAudit({
      action: 'SEND_BROADCAST',
      category: 'BROADCAST',
      severity: 'high',
      adminId: req.user._id,
      adminName: req.user.name || req.user.email,
      adminEmail: req.user.email,
      details: `Manually fired scheduled broadcast "${broadcast.title}" early`,
      metadata: { broadcastId: broadcast._id },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Broadcast fired immediately.' });
  } catch (err) {
    logger.error('Fire broadcast error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
