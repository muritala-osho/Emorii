
const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Activity = require('../models/Activity');
const Match = require('../models/Match');

router.get('/profile-views', protect, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    const daysAgo = parseInt(period) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const Activity = require('../models/Activity');
    const views = await Activity.countDocuments({
      targetUserId: req.user._id,
      type: 'profile_view',
      timestamp: { $gte: startDate }
    });

    res.json({
      success: true,
      views,
      period
    });
  } catch (error) {
    logger.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/match-rate', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    
    const totalSwipesRight = user.swipedRight.length;
    const matches = await Match.countDocuments({
      users: req.user._id,
      status: 'active'
    });

    const matchRate = totalSwipesRight > 0 
      ? ((matches / totalSwipesRight) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      matchRate,
      totalMatches: matches,
      totalLikes: totalSwipesRight
    });
  } catch (error) {
    logger.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
