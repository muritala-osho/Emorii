const logger = require('../utils/logger');

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Match = require('../models/Match');
const Message = require('../models/Message');

router.post('/:userId', protect, async (req, res) => {
  try {
    const userToBlock = req.params.userId;
    
    if (userToBlock === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block yourself'
      });
    }
    
    const user = await User.findById(req.user._id);
    
    if (user.blockedUsers.includes(userToBlock)) {
      return res.status(400).json({
        success: false,
        message: 'User is already blocked'
      });
    }
    
    user.blockedUsers.push(userToBlock);

    user.swipedRight = (user.swipedRight || []).filter(
      id => id.toString() !== userToBlock
    );
    user.swipedLeft = (user.swipedLeft || []).filter(
      id => id.toString() !== userToBlock
    );

    await user.save();

    const otherUser = await User.findById(userToBlock);
    if (otherUser) {
      otherUser.swipedRight = (otherUser.swipedRight || []).filter(
        id => id.toString() !== req.user._id.toString()
      );
      otherUser.swipedLeft = (otherUser.swipedLeft || []).filter(
        id => id.toString() !== req.user._id.toString()
      );
      await otherUser.save();
    }

    const deletedMatches = await Match.find({
      users: { $all: [req.user._id, userToBlock] }
    }).select('_id');
    const matchIds = deletedMatches.map(m => m._id);

    await Match.deleteMany({
      users: { $all: [req.user._id, userToBlock] }
    });

    if (matchIds.length > 0) {
      await Message.deleteMany({
        matchId: { $in: matchIds }
      });
    }

    await Message.deleteMany({
      $or: [
        { sender: req.user._id, receiver: userToBlock },
        { sender: userToBlock, receiver: req.user._id }
      ]
    });

    const FriendRequest = require('../models/FriendRequest');
    await FriendRequest.deleteMany({
      $or: [
        { sender: req.user._id, receiver: userToBlock },
        { sender: userToBlock, receiver: req.user._id }
      ]
    });

    logger.log(`[BLOCK] User ${req.user._id} blocked ${userToBlock} - removed match, messages, friend requests, swipe history`);

    res.json({
      success: true,
      message: 'User blocked successfully'
    });
  } catch (error) {
    logger.error('Block user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user'
    });
  }
});

router.delete('/:userId', protect, async (req, res) => {
  try {
    const userToUnblock = req.params.userId;
    
    const user = await User.findById(req.user._id);
    
    const wasBlocked = user.blockedUsers.some(
      id => id.toString() === userToUnblock
    );

    if (!wasBlocked) {
      return res.status(400).json({
        success: false,
        message: 'User is not blocked'
      });
    }

    user.blockedUsers = user.blockedUsers.filter(
      id => id.toString() !== userToUnblock
    );
    await user.save();

    logger.log(`[UNBLOCK] User ${req.user._id} unblocked ${userToUnblock} - user is now discoverable again (no auto-restore match)`);
    
    res.json({
      success: true,
      message: 'User unblocked successfully. They will appear in discovery again but previous match is not restored.'
    });
  } catch (error) {
    logger.error('Unblock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unblock user'
    });
  }
});

router.get('/list', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('blockedUsers', 'name photos');
    
    res.json({
      success: true,
      blockedUsers: user.blockedUsers
    });
  } catch (error) {
    logger.error('Get blocked users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blocked users'
    });
  }
});

module.exports = router;
