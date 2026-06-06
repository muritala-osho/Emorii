
const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Report = require('../models/Report');
const User = require('../models/User');
const Story = require('../models/Story');
const Message = require('../models/Message');
const SuccessStory = require('../models/SuccessStory');
const { sendAdminPushNotification } = require('../services/adminPushService');

router.post('/', protect, async (req, res) => {
  try {
    const { reportedUserId, reason, description, contentType, contentId, contentUrl, contentPreview } = req.body;

    if (!reportedUserId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Reported user and reason are required'
      });
    }

    if (reportedUserId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot report yourself'
      });
    }

    const validReasons = ['inappropriate', 'harassment', 'spam', 'fake', 'underage', 'other'];
    let normalizedReason = reason.toLowerCase().trim();
    if (!validReasons.includes(normalizedReason)) {
      normalizedReason = 'other';
    }

    const reportedUser = await User.findById(reportedUserId).select('photos name bio voiceBio');
    if (!reportedUser) {
      return res.status(404).json({
        success: false,
        message: 'Reported user not found'
      });
    }

    const ALLOWED_CONTENT_TYPES = [
      'profile_photo', 'story', 'message_image', 'message_text', 'message_audio',
      'message_video', 'user', 'comment', 'voice_bio', 'success_story', 'bio'
    ];
    let normalizedContentType = ALLOWED_CONTENT_TYPES.includes(contentType) ? contentType : 'user';
    let normalizedContentId = contentId ? String(contentId) : undefined;
    let normalizedContentUrl = contentUrl;
    let normalizedContentPreview = contentPreview;
    let contentMeta;

    if (normalizedContentType === 'profile_photo') {
      const photos = reportedUser.photos || [];
      let photoIndex = Number.parseInt(String(normalizedContentId ?? ''), 10);
      if (!Number.isInteger(photoIndex) || photoIndex < 0 || photoIndex >= photos.length) {
        photoIndex = photos.findIndex(photo => (photo?.url || photo) === normalizedContentUrl);
      }
      if (photoIndex < 0 && photos.length > 0) photoIndex = 0;
      const photo = photos[photoIndex];
      if (!photo) {
        normalizedContentType = 'user';
      } else {
        normalizedContentId = String(photoIndex);
        normalizedContentUrl = photo.url || photo;
        contentMeta = { photoIndex };
      }
    }

    if (normalizedContentType === 'story') {
      const story = await Story.findById(normalizedContentId);
      if (!story || story.user.toString() !== reportedUserId) {
        return res.status(400).json({ success: false, message: 'Story does not belong to the reported user' });
      }
      normalizedContentUrl = story.mediaUrl || story.imageUrl || story.thumbnail || normalizedContentUrl;
      normalizedContentPreview = story.textContent || story.content || normalizedContentPreview;
      contentMeta = { storyType: story.type };
    }

    if (normalizedContentType === 'message_image') {
      const message = await Message.findById(normalizedContentId);
      if (!message || message.sender.toString() !== reportedUserId || message.type !== 'image' || !message.imageUrl) {
        return res.status(400).json({ success: false, message: 'Image message does not belong to the reported user' });
      }
      normalizedContentUrl = message.imageUrl;
      normalizedContentPreview = message.content || 'Reported image message';
      contentMeta = { matchId: message.matchId };
    }

    if (normalizedContentType === 'message_text') {
      const message = await Message.findById(normalizedContentId);
      if (!message || message.sender.toString() !== reportedUserId) {
        return res.status(400).json({ success: false, message: 'Text message does not belong to the reported user' });
      }
      normalizedContentPreview = message.content || normalizedContentPreview || '(no text)';
      contentMeta = { matchId: message.matchId };
    }

    if (normalizedContentType === 'message_audio') {
      const message = await Message.findById(normalizedContentId);
      if (!message || message.sender.toString() !== reportedUserId || !message.audioUrl) {
        return res.status(400).json({ success: false, message: 'Voice message does not belong to the reported user' });
      }
      normalizedContentUrl = message.audioUrl;
      normalizedContentPreview = message.content || 'Reported voice message';
      contentMeta = { matchId: message.matchId, duration: message.audioDuration };
    }

    if (normalizedContentType === 'message_video') {
      const message = await Message.findById(normalizedContentId);
      if (!message || message.sender.toString() !== reportedUserId || !message.videoUrl) {
        return res.status(400).json({ success: false, message: 'Video message does not belong to the reported user' });
      }
      normalizedContentUrl = message.videoUrl;
      normalizedContentPreview = message.content || 'Reported video message';
      contentMeta = { matchId: message.matchId };
    }

    if (normalizedContentType === 'voice_bio') {
      const voiceUrl = reportedUser.voiceBio?.url;
      if (!voiceUrl) {
        return res.status(400).json({ success: false, message: 'This user has no voice bio to report' });
      }
      normalizedContentUrl = voiceUrl;
      normalizedContentPreview = normalizedContentPreview || 'Voice bio';
      contentMeta = { publicId: reportedUser.voiceBio?.publicId };
    }

    if (normalizedContentType === 'bio') {
      if (!reportedUser.bio) {
        return res.status(400).json({ success: false, message: 'This user has no bio to report' });
      }
      normalizedContentPreview = reportedUser.bio.slice(0, 500);
      normalizedContentUrl = undefined;
    }

    if (normalizedContentType === 'success_story') {
      const story = await SuccessStory.findById(normalizedContentId);
      if (!story) {
        return res.status(400).json({ success: false, message: 'Success story not found' });
      }
      const isOwner = story.submittedBy?.toString() === reportedUserId
        || story.couple?.some(id => id.toString() === reportedUserId);
      if (!isOwner) {
        return res.status(400).json({ success: false, message: 'Success story does not belong to the reported user' });
      }
      normalizedContentUrl = story.photos?.[0]?.url || normalizedContentUrl;
      normalizedContentPreview = story.title ? `${story.title}\n\n${story.story?.slice(0, 300) || ''}` : story.story?.slice(0, 500);
      contentMeta = { storyType: 'success_story' };
    }

    const report = await Report.create({
      reporter: req.user._id,
      reportedBy: req.user._id,
      reportedUser: reportedUserId,
      reason: normalizedReason,
      description,
      matchId: req.body.matchId || undefined,
      contentType: normalizedContentType,
      contentId: normalizedContentId,
      contentUrl: normalizedContentUrl,
      contentPreview: normalizedContentPreview,
      contentMeta
    });

    sendAdminPushNotification({
      type: 'NEW_REPORT',
      body: `New ${normalizedReason} report filed against a user. Tap to review in Safety Hub.`,
      data: { tab: 'reports', reportId: report._id.toString() },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      report
    });
  } catch (error) {
    logger.error('Report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit report'
    });
  }
});

router.post('/block/:userId', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);

    if (!user.blockedUsers.includes(req.params.userId)) {
      user.blockedUsers.push(req.params.userId);
      await user.save();
    }

    res.json({
      success: true,
      message: 'User blocked successfully'
    });
  } catch (error) {
    logger.error('Block error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user'
    });
  }
});

router.delete('/block/:userId', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);

    user.blockedUsers = user.blockedUsers.filter(
      id => id.toString() !== req.params.userId
    );
    await user.save();

    res.json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    logger.error('Unblock error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unblock user'
    });
  }
});

module.exports = router;
