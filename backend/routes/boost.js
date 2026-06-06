const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Boost = require('../models/Boost');
const User = require('../models/User');
const redis = require('../utils/redis');

const BOOST_CONFIGS = {
  standard: { duration: 30, multiplier: 2, name: 'Standard Boost' },
  super: { duration: 60, multiplier: 3, name: 'Super Boost' },
  premium: { duration: 180, multiplier: 5, name: 'Premium Boost' }
};

router.get('/status', protect, async (req, res) => {
  try {
    const cacheKey = `boost:status:${req.user._id}`;
    const cachedBoost = await redis.get(cacheKey);
    if (cachedBoost) return res.json({ success: true, ...cachedBoost, fromCache: true });

    const activeBoost = await Boost.getActiveBoost(req.user._id);
    
    if (!activeBoost) {
      const noBoostPayload = { hasActiveBoost: false, boost: null };
      await redis.set(cacheKey, noBoostPayload, 30);
      return res.json({ success: true, ...noBoostPayload });
    }

    const now = new Date();
    const remainingMs = activeBoost.expiresAt - now;
    const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));

    const boostPayload = {
      hasActiveBoost: true,
      boost: {
        id: activeBoost._id,
        type: activeBoost.type,
        multiplier: activeBoost.multiplier,
        startedAt: activeBoost.startedAt,
        expiresAt: activeBoost.expiresAt,
        remainingMinutes,
        viewsGained: activeBoost.viewsGained,
        likesGained: activeBoost.likesGained,
        matchesGained: activeBoost.matchesGained
      }
    };
    await redis.set(cacheKey, boostPayload, 30);
    res.json({ success: true, ...boostPayload });
  } catch (error) {
    logger.error('Get boost status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get boost status' });
  }
});

router.post('/activate', protect, async (req, res) => {
  try {
    const { type = 'standard', source = 'purchase' } = req.body;

    if (!BOOST_CONFIGS[type]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid boost type'
      });
    }

    const existingBoost = await Boost.getActiveBoost(req.user._id);
    if (existingBoost) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active boost',
        existingBoost: {
          type: existingBoost.type,
          expiresAt: existingBoost.expiresAt
        }
      });
    }

    const config = BOOST_CONFIGS[type];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.duration * 60000);

    const boost = await Boost.create({
      userId: req.user._id,
      type,
      multiplier: config.multiplier,
      startedAt: now,
      expiresAt,
      source
    });

    await redis.del(`boost:status:${req.user._id}`);
    await redis.del(`boost:history:${req.user._id}`);
    res.json({
      success: true,
      message: `${config.name} activated!`,
      boost: {
        id: boost._id,
        type: boost.type,
        multiplier: boost.multiplier,
        durationMinutes: config.duration,
        startedAt: boost.startedAt,
        expiresAt: boost.expiresAt
      }
    });
  } catch (error) {
    logger.error('Activate boost error:', error);
    res.status(500).json({ success: false, message: 'Failed to activate boost' });
  }
});

router.post('/extend', protect, async (req, res) => {
  try {
    const { additionalMinutes = 30 } = req.body;

    const activeBoost = await Boost.getActiveBoost(req.user._id);
    if (!activeBoost) {
      return res.status(400).json({
        success: false,
        message: 'No active boost to extend'
      });
    }

    const maxExtension = 180;
    const extension = Math.min(additionalMinutes, maxExtension);
    
    activeBoost.expiresAt = new Date(activeBoost.expiresAt.getTime() + extension * 60000);
    await activeBoost.save();
    await redis.del(`boost:status:${req.user._id}`);

    res.json({
      success: true,
      message: `Boost extended by ${extension} minutes`,
      newExpiresAt: activeBoost.expiresAt
    });
  } catch (error) {
    logger.error('Extend boost error:', error);
    res.status(500).json({ success: false, message: 'Failed to extend boost' });
  }
});

router.delete('/cancel', protect, async (req, res) => {
  try {
    const activeBoost = await Boost.getActiveBoost(req.user._id);
    if (!activeBoost) {
      return res.status(400).json({
        success: false,
        message: 'No active boost to cancel'
      });
    }

    activeBoost.isActive = false;
    await activeBoost.save();
    await redis.del(`boost:status:${req.user._id}`);
    await redis.del(`boost:history:${req.user._id}`);

    res.json({
      success: true,
      message: 'Boost cancelled',
      stats: {
        viewsGained: activeBoost.viewsGained,
        likesGained: activeBoost.likesGained,
        matchesGained: activeBoost.matchesGained
      }
    });
  } catch (error) {
    logger.error('Cancel boost error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel boost' });
  }
});

router.get('/history', protect, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const cacheKey = `boost:history:${req.user._id}`;
    const cachedHistory = await redis.get(cacheKey);
    if (cachedHistory) return res.json({ success: true, ...cachedHistory, fromCache: true });

    const boosts = await Boost.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const stats = await Boost.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: null,
          totalBoosts: { $sum: 1 },
          totalViews: { $sum: '$viewsGained' },
          totalLikes: { $sum: '$likesGained' },
          totalMatches: { $sum: '$matchesGained' }
        }
      }
    ]);

    const historyPayload = {
      boosts: boosts.map(b => ({
        id: b._id,
        type: b.type,
        startedAt: b.startedAt,
        expiresAt: b.expiresAt,
        wasActive: b.isActive && b.expiresAt > new Date(),
        viewsGained: b.viewsGained,
        likesGained: b.likesGained,
        matchesGained: b.matchesGained,
        source: b.source
      })),
      totalStats: stats[0] || {
        totalBoosts: 0,
        totalViews: 0,
        totalLikes: 0,
        totalMatches: 0
      }
    };
    await redis.set(cacheKey, historyPayload, 120);
    res.json({ success: true, ...historyPayload });
  } catch (error) {
    logger.error('Get boost history error:', error);
    res.status(500).json({ success: false, message: 'Failed to get boost history' });
  }
});

router.get('/packages', protect, async (req, res) => {
  try {
    const cached = await redis.get('boost:packages');
    if (cached) return res.json({ success: true, packages: cached, fromCache: true });

    const packages = Object.entries(BOOST_CONFIGS).map(([key, config]) => ({
      id: key,
      name: config.name,
      durationMinutes: config.duration,
      multiplier: config.multiplier,
      description: `Boost your profile ${config.multiplier}x for ${config.duration} minutes`
    }));

    await redis.set('boost:packages', packages, 3600);
    res.json({
      success: true,
      packages
    });
  } catch (error) {
    logger.error('Get boost packages error:', error);
    res.status(500).json({ success: false, message: 'Failed to get packages' });
  }
});

const recordBoostStat = async (userId, stat) => {
  try {
    const activeBoost = await Boost.getActiveBoost(userId);
    if (activeBoost) {
      await activeBoost.incrementStat(stat);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Record boost stat error:', error);
    return false;
  }
};

router.recordBoostStat = recordBoostStat;

module.exports = router;
