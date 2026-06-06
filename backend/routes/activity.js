const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const redis = require('../utils/redis');

router.put('/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['online', 'offline', 'away'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const updateData = {
      onlineStatus: status,
      lastActive: new Date()
    };

    await User.findByIdAndUpdate(req.user.id, updateData);
    await redis.del(`activity:status:${req.user.id}`);

    res.json({
      success: true,
      data: { status, lastActive: updateData.lastActive }
    });
  } catch (error) {
    logger.error('Update activity status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/status/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user._id.toString()) {
      const Match = require('../models/Match');
      const match = await Match.findOne({
        users: { $all: [req.user._id, userId] },
        status: 'active'
      });
      if (!match) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const cacheKey = `activity:status:${userId}`;
    const cachedStatus = await redis.get(cacheKey);
    if (cachedStatus) return res.json({ success: true, data: cachedStatus, fromCache: true });
    
    const user = await User.findById(userId).select('onlineStatus lastActive privacySettings');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const privacy = user.privacySettings || {};
    const statusData = {
      onlineStatus: privacy.showOnlineStatus === false ? null : user.onlineStatus,
      lastActive: privacy.showLastActive === false ? null : user.lastActive
    };

    await redis.set(cacheKey, statusData, 30);
    res.json({ success: true, data: statusData });
  } catch (error) {
    logger.error('Get activity status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/heartbeat', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      onlineStatus: 'online',
      lastActive: new Date()
    });
    await redis.del(`activity:status:${req.user.id}`);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
