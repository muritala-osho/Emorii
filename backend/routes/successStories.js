const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const SuccessStory = require('../models/SuccessStory');
const User = require('../models/User');

router.post('/', protect, async (req, res) => {
  try {
    const {
      partnerId,
      title,
      story,
      howWeMet,
      firstMessage,
      relationship,
      matchDate,
      milestoneDate,
      photos,
      tags,
      location,
      isAnonymous
    } = req.body;

    if (!title || !story || !relationship) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const couple = partnerId ? [req.user._id, partnerId] : [req.user._id];

    const successStory = await SuccessStory.create({
      couple,
      submittedBy: req.user._id,
      title,
      story,
      howWeMet,
      firstMessage,
      relationship,
      matchDate,
      milestoneDate,
      photos: Array.isArray(photos) ? photos.map(p => typeof p === 'string' ? { url: p } : p) : [],
      tags: tags || [],
      location,
      isAnonymous: isAnonymous || false,
      status: 'approved'
    });

    res.status(201).json({
      success: true,
      data: successStory,
      message: 'Your love story has been published!'
    });
  } catch (error) {
    logger.error('Submit story error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const { featured, relationship, limit = 20, skip = 0 } = req.query;
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skipNum = Math.max(0, parseInt(skip, 10) || 0);

    const query = {
      $or: [
        { status: 'approved' },
        { submittedBy: req.user._id, status: 'pending' }
      ]
    };
    if (featured === 'true') query.featured = true;
    if (relationship) {
      query.relationship = relationship;
    }

    const stories = await SuccessStory.find(query)
      .populate('couple', 'name photos')
      .sort({ featured: -1, likeCount: -1, createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum);

    const processedStories = stories.map(story => {
      const storyObj = story.toObject();
      if (story.isAnonymous && !story.submittedBy.equals(req.user._id)) {
        storyObj.couple = storyObj.couple.map(user => ({
          _id: user._id,
          name: 'Anonymous',
          photos: []
        }));
      }
      storyObj.hasLiked = story.likes.includes(req.user._id);
      storyObj.isOwn = story.submittedBy.equals(req.user._id);
      storyObj.isPending = story.status === 'pending';
      return storyObj;
    });

    const total = await SuccessStory.countDocuments(query);

    res.json({
      success: true,
      data: processedStories,
      total,
      hasMore: total > skipNum + processedStories.length,
      pagination: {
        skip: skipNum,
        limit: limitNum,
        total,
        hasMore: total > skipNum + processedStories.length,
      }
    });
  } catch (error) {
    logger.error('Get stories error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/featured', protect, async (req, res) => {
  try {
    const stories = await SuccessStory.find({
      status: 'approved',
      featured: true
    })
      .populate('couple', 'name photos')
      .sort({ likeCount: -1 })
      .limit(5);

    const processedStories = stories.map(story => {
      const storyObj = story.toObject();
      if (story.isAnonymous) {
        storyObj.couple = storyObj.couple.map(() => ({
          name: 'Anonymous',
          photos: []
        }));
      }
      return storyObj;
    });

    res.json({ success: true, data: processedStories });
  } catch (error) {
    logger.error('Get featured stories error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/stats', protect, async (req, res) => {
  try {
    const stats = await SuccessStory.aggregate([
      { $match: { status: 'approved' } },
      {
        $group: {
          _id: '$relationship',
          count: { $sum: 1 }
        }
      }
    ]);

    const statsMap = stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const totalStories = Object.values(statsMap).reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      data: {
        totalStories,
        totalMarried: statsMap.married || 0,
        totalEngaged: statsMap.engaged || 0,
        totalDating: statsMap.dating || 0,
        totalCouples: totalStories
      }
    });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/my-story', protect, async (req, res) => {
  try {
    const story = await SuccessStory.findOne({
      couple: req.user._id
    }).populate('couple', 'name photos');

    res.json({ success: true, data: story });
  } catch (error) {
    logger.error('Get my story error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:storyId', protect, async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.storyId)
      .populate('couple', 'name photos verified');

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    if (story.status !== 'approved' && !story.couple.some(u => u._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ success: false, message: 'Story not available' });
    }

    story.viewCount += 1;
    await story.save();

    const storyObj = story.toObject();
    if (story.isAnonymous && !story.couple.some(u => u._id.toString() === req.user._id.toString())) {
      storyObj.couple = storyObj.couple.map(() => ({
        name: 'Anonymous',
        photos: []
      }));
    }
    storyObj.hasLiked = story.likes.includes(req.user._id);

    res.json({ success: true, data: storyObj });
  } catch (error) {
    logger.error('Get story error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:storyId/like', protect, async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.storyId);

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    const hasLiked = story.likes.includes(req.user._id);

    if (hasLiked) {
      story.likes = story.likes.filter(id => id.toString() !== req.user._id.toString());
      story.likeCount = Math.max(0, story.likeCount - 1);
    } else {
      story.likes.push(req.user._id);
      story.likeCount += 1;
    }

    await story.save();

    res.json({
      success: true,
      data: {
        liked: !hasLiked,
        likeCount: story.likeCount
      }
    });
  } catch (error) {
    logger.error('Like story error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:storyId', protect, async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.storyId);

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    if (story.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const allowedUpdates = [
      'title', 'story', 'howWeMet', 'firstMessage', 'relationship',
      'matchDate', 'milestoneDate', 'photos', 'tags', 'location', 'isAnonymous'
    ];

    allowedUpdates.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(req.body, field) && req.body[field] !== undefined) {
        story[field] = req.body[field];
      }
    });

    if (story.status === 'approved') {
      story.status = 'pending';
    }

    await story.save();

    res.json({ success: true, data: story });
  } catch (error) {
    logger.error('Update story error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:storyId', protect, async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.storyId);

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    if (story.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await story.deleteOne();

    res.json({ success: true, message: 'Story deleted' });
  } catch (error) {
    logger.error('Delete story error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
