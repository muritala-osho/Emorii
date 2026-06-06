const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');

const isAdmin = async (req, res, next) => {
  if (!req.user.isAdmin && !req.user.isSupportAgent) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

router.get('/', protect, isAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      category,
      severity,
      adminId,
      action,
      dateFrom,
      dateTo,
      search,
    } = req.query;

    const query = {};

    if (category) query.category = category;
    if (severity)  query.severity = severity;
    if (adminId)   query.adminId  = adminId;
    if (action)    query.action   = action;

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo)   query.createdAt.$lte = new Date(dateTo);
    }

    if (search) {
      if (search.length > 200) {
        return res.status(400).json({ success: false, message: 'Search term too long' });
      }
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      query.$or = [
        { adminName: re },
        { targetUserName: re },
        { details: re },
        { action: re },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error('Audit log fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/stats', protect, isAdmin, async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [total, bySeverity, byCategory, recentAdmins] = await Promise.all([
      AuditLog.countDocuments({ createdAt: { $gte: since } }),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$adminId', name: { $first: '$adminName' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        bySeverity: Object.fromEntries(bySeverity.map(s => [s._id, s.count])),
        byCategory: byCategory.map(c => ({ category: c._id, count: c.count })),
        topAdmins: recentAdmins.map(a => ({ id: a._id, name: a.name, count: a.count })),
      },
    });
  } catch (error) {
    logger.error('Audit stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
