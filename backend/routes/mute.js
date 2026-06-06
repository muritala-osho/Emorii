const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');

router.post('/user', protect, async (req, res) => {
  try {
    const { userId, muteAll, muteMessages, muteVoiceCalls, muteVideoCalls } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const existingMute = user.muteSettings.mutedUsers.findIndex(
      m => m.userId.toString() === userId.toString()
    );

    const muteData = {
      userId,
      muteAll: muteAll === undefined ? true : muteAll,
      muteMessages: muteMessages || false,
      muteVoiceCalls: muteVoiceCalls || false,
      muteVideoCalls: muteVideoCalls || false,
      mutedAt: new Date()
    };

    if (existingMute !== -1) {
      user.muteSettings.mutedUsers[existingMute] = muteData;
    } else {
      user.muteSettings.mutedUsers.push(muteData);
    }

    await user.save();

    res.json({
      success: true,
      message: 'User muted successfully',
      data: muteData
    });
  } catch (error) {
    logger.error('Mute user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.delete('/user/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.muteSettings.mutedUsers = user.muteSettings.mutedUsers.filter(
      m => m.userId.toString() !== userId.toString()
    );

    await user.save();

    res.json({
      success: true,
      message: 'User unmuted successfully'
    });
  } catch (error) {
    logger.error('Unmute user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/muted-users', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('muteSettings.mutedUsers.userId', 'name photos');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user.muteSettings.mutedUsers
    });
  } catch (error) {
    logger.error('Get muted users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.put('/dnd', protect, async (req, res) => {
  try {
    const { enabled, startTime, endTime, allowCalls } = req.body;

    if (enabled && (!startTime || !endTime)) {
      return res.status(400).json({
        success: false,
        message: 'Start time and end time are required when enabling DND'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.muteSettings.globalMute = {
      enabled,
      startTime,
      endTime,
      allowCalls: allowCalls || false
    };

    await user.save();

    res.json({
      success: true,
      message: 'DND settings updated',
      data: user.muteSettings.globalMute
    });
  } catch (error) {
    logger.error('Update DND error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/dnd', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user.muteSettings.globalMute
    });
  } catch (error) {
    logger.error('Get DND error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.put('/notification-preferences', protect, async (req, res) => {
  try {
    const {
      messagesEnabled,
      voiceCallsEnabled,
      videoCallsEnabled,
      matchesEnabled,
      likesEnabled,
      soundEnabled,
      vibrationEnabled
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (messagesEnabled !== undefined) user.notificationPreferences.messagesEnabled = messagesEnabled;
    if (voiceCallsEnabled !== undefined) user.notificationPreferences.voiceCallsEnabled = voiceCallsEnabled;
    if (videoCallsEnabled !== undefined) user.notificationPreferences.videoCallsEnabled = videoCallsEnabled;
    if (matchesEnabled !== undefined) user.notificationPreferences.matchesEnabled = matchesEnabled;
    if (likesEnabled !== undefined) user.notificationPreferences.likesEnabled = likesEnabled;
    if (soundEnabled !== undefined) user.notificationPreferences.soundEnabled = soundEnabled;
    if (vibrationEnabled !== undefined) user.notificationPreferences.vibrationEnabled = vibrationEnabled;

    await user.save();

    res.json({
      success: true,
      message: 'Notification preferences updated',
      data: user.notificationPreferences
    });
  } catch (error) {
    logger.error('Update notification preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/notification-preferences', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user.notificationPreferences
    });
  } catch (error) {
    logger.error('Get notification preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/is-muted/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const mutedUser = user.muteSettings.mutedUsers.find(
      m => m.userId.toString() === userId.toString()
    );

    res.json({
      success: true,
      isMuted: !!mutedUser,
      muteSettings: mutedUser || null
    });
  } catch (error) {
    logger.error('Check mute error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
