const logger = require('../utils/logger');

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Match = require('../models/Match');
const Message = require('../models/Message');
const Activity = require('../models/Activity');
const CallHistory = require('../models/CallHistory');
const FriendRequest = require('../models/FriendRequest');
const crypto = require('crypto');
const { sendOTP } = require('../utils/emailService');
const { logAudit } = require('../utils/auditHelper');

router.delete('/delete', protect, async (req, res) => {
  try {
    const { password, reason } = req.body;
    
    const user = await User.findById(req.user._id).select('+password');
    
    if (user.password && password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect password'
        });
      }
    } else if (user.password && !password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete account'
      });
    }
    
    logger.log('Account deletion - User ID:', user._id, 'Reason:', reason);

    await logAudit({
      action: 'SELF_DELETE_ACCOUNT',
      category: 'ACCOUNT',
      severity: 'critical',
      adminId: user._id,
      adminName: user.name,
      adminEmail: user.email,
      targetUserId: user._id,
      targetUserName: user.name,
      targetUserEmail: user.email,
      details: `User self-deleted account. Reason: ${reason || 'not provided'}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
    });

    await Promise.all([
      User.deleteOne({ _id: user._id }),
      
      Match.deleteMany({ users: user._id }),
      
      Message.deleteMany({ sender: user._id }),
      
      Message.deleteMany({ $or: [{ sender: user._id }, { receiver: user._id }] }),
      
      Activity.deleteMany({ $or: [{ userId: user._id }, { targetUserId: user._id }] }),
      
      CallHistory.deleteMany({ $or: [{ caller: user._id }, { receiver: user._id }] }),
      
      FriendRequest.deleteMany({ $or: [{ from: user._id }, { to: user._id }] })
    ]);
    
    res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted'
    });
  } catch (error) {
    logger.error('Account deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
});

router.post('/export-data', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    await logAudit({
      action: 'EXPORT_USER_DATA',
      category: 'ACCOUNT',
      severity: 'high',
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email,
      targetUserId: req.user._id,
      targetUserName: req.user.name,
      targetUserEmail: req.user.email,
      details: 'User exported all personal data (GDPR/data portability).',
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
    });
    const matches = await Match.find({ users: req.user._id }).populate('users', 'name email');
    const messages = await Message.find({ 
      $or: [{ sender: req.user._id }, { receiver: req.user._id }] 
    });
    const activities = await Activity.find({ userId: req.user._id });
    const callHistory = await CallHistory.find({ 
      $or: [{ caller: req.user._id }, { receiver: req.user._id }] 
    });
    
    const exportData = {
      exportDate: new Date(),
      profile: {
        name: user.name,
        email: user.email,
        age: user.age,
        gender: user.gender,
        bio: user.bio,
        interests: user.interests,
        location: user.location,
        verified: user.verified,
        createdAt: user.createdAt
      },
      matches: matches.map(m => ({
        matchedWith: m.users.filter(u => u._id.toString() !== req.user._id.toString())[0]?.name,
        matchedAt: m.createdAt
      })),
      messageCount: messages.length,
      activityCount: activities.length,
      callHistoryCount: callHistory.length
    };
    
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    logger.error('Data export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export data'
    });
  }
});

router.get('/privacy-settings', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({
      success: true,
      data: user.privacySettings || {
        hideAge: false,
        showOnlineStatus: true,
        showDistance: true,
        showLastActive: true,
        whoCanViewStories: 'friends',
        allowMessageCopying: true
      }
    });
  } catch (error) {
    logger.error('Get privacy settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get privacy settings'
    });
  }
});

router.put('/privacy-settings', protect, async (req, res) => {
  try {
    const { showOnlineStatus, showDistance, showLastActive, hideAge, whoCanViewStories, allowMessageCopying } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (!user.privacySettings) {
      user.privacySettings = {};
    }
    
    if (showOnlineStatus !== undefined) {
      user.privacySettings.showOnlineStatus = showOnlineStatus;
    }
    if (showDistance !== undefined) {
      user.privacySettings.showDistance = showDistance;
    }
    if (showLastActive !== undefined) {
      user.privacySettings.showLastActive = showLastActive;
    }
    if (hideAge !== undefined) {
      user.privacySettings.hideAge = hideAge;
    }
    if (whoCanViewStories !== undefined) {
      user.privacySettings.whoCanViewStories = whoCanViewStories;
    }
    if (allowMessageCopying !== undefined) {
      user.privacySettings.allowMessageCopying = allowMessageCopying;
    }
    
    await user.save();
    
    res.json({
      success: true,
      privacySettings: user.privacySettings
    });
  } catch (error) {
    logger.error('Privacy settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update privacy settings'
    });
  }
});

router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }
    
    const user = await User.findById(req.user._id).select('+password');
    
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change password for accounts created with social login'
      });
    }
    
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    user.password = newPassword;
    await user.save();
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

router.put('/settings', protect, async (req, res) => {
  try {
    const { emailNotifications, pushNotifications, theme } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (!user.settings) {
      user.settings = {};
    }
    
    if (emailNotifications !== undefined) {
      user.settings.emailNotifications = emailNotifications;
    }
    if (pushNotifications !== undefined) {
      user.settings.pushNotifications = pushNotifications;
      user.pushNotificationsEnabled = pushNotifications;
    }
    if (theme !== undefined && ['light', 'dark', 'system'].includes(theme)) {
      user.settings.theme = theme;
    }
    
    await user.save();
    
    res.json({
      success: true,
      settings: user.settings
    });
  } catch (error) {
    logger.error('Settings update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
});

router.get('/settings', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      settings: user.settings || { emailNotifications: true, pushNotifications: true, theme: 'system' },
      privacySettings: user.privacySettings || {}
    });
  } catch (error) {
    logger.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get settings'
    });
  }
});

router.post('/request-deletion-otp', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    const otp = crypto.randomInt(100000, 999999).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    
    user.deletionOTP = otp;
    user.deletionOTPExpire = otpExpiry;
    await user.save();
    
    await sendOTP(user.email, otp);
    
    res.json({
      success: true,
      message: 'Verification code sent to your email'
    });
  } catch (error) {
    logger.error('Request deletion OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code'
    });
  }
});

router.delete('/delete-with-otp', protect, async (req, res) => {
  try {
    const { otp, reason } = req.body;
    
    const user = await User.findById(req.user._id);
    
    if (!user.deletionOTP || !user.deletionOTPExpire) {
      return res.status(400).json({
        success: false,
        message: 'Please request a verification code first'
      });
    }
    
    if (user.deletionOTP !== otp) {
      return res.status(401).json({
        success: false,
        message: 'Invalid verification code'
      });
    }
    
    if (new Date() > user.deletionOTPExpire) {
      return res.status(401).json({
        success: false,
        message: 'Verification code has expired'
      });
    }
    
    logger.log('Account deletion with OTP - User ID:', user._id, 'Reason:', reason);

    await logAudit({
      action: 'SELF_DELETE_ACCOUNT_OTP',
      category: 'ACCOUNT',
      severity: 'critical',
      adminId: user._id,
      adminName: user.name,
      adminEmail: user.email,
      targetUserId: user._id,
      targetUserName: user.name,
      targetUserEmail: user.email,
      details: `User self-deleted account via OTP. Reason: ${reason || 'not provided'}`,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
    });

    await Promise.all([
      User.deleteOne({ _id: user._id }),
      Match.deleteMany({ users: user._id }),
      Message.deleteMany({ $or: [{ sender: user._id }, { receiver: user._id }] }),
      Activity.deleteMany({ $or: [{ userId: user._id }, { targetUserId: user._id }] }),
      CallHistory.deleteMany({ $or: [{ caller: user._id }, { receiver: user._id }] }),
      FriendRequest.deleteMany({ $or: [{ from: user._id }, { to: user._id }] })
    ]);
    
    res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted'
    });
  } catch (error) {
    logger.error('Account deletion with OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
});

router.get('/check-auth-method', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('password googleId');
    
    res.json({
      success: true,
      hasPassword: !!user.password,
      isOAuthUser: !!user.googleId
    });
  } catch (error) {
    logger.error('Check auth method error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check authentication method'
    });
  }
});

module.exports = router;
