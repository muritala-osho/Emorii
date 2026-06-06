
const express = require('express');
const logger = require('../utils/logger');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');
const redis = require('../utils/redis');
const { notifyExhaustedUsersOfNewMember } = require('../utils/discoveryNotifier');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const VIDEO_UPLOAD_DIR = path.join(__dirname, '..', 'public', 'verification-videos');

const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      await fs.promises.mkdir(VIDEO_UPLOAD_DIR, { recursive: true });
      cb(null, VIDEO_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const ext = file.mimetype === 'video/quicktime' ? 'mov' : 'mp4';
      cb(null, `${req.user?._id || 'unknown'}-${Date.now()}.${ext}`);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith('video/')) {
      return cb(new Error('Video file required'));
    }
    cb(null, true);
  },
});

const isAdmin = async (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

const handleVerificationVideoUpload = async (req, res) => {
  const tempPath = req.file?.path || null;
  try {
    if (tempPath) {
      const resolvedPath = path.resolve(tempPath);
      const resolvedDir  = path.resolve(VIDEO_UPLOAD_DIR);
      if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
        return res.status(400).json({ success: false, message: 'Invalid file path' });
      }
    }

    const requestedUserId     = req.body.userId;
    const authenticatedUserId = req.user._id.toString();
    const userId              = requestedUserId || authenticatedUserId;

    if (requestedUserId && requestedUserId !== authenticatedUserId && !req.user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Cannot upload verification for another user' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Video file required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let videoUrl = null;
    let publicId = null;
    let storage  = 'local';

    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      try {
        const uploaded = await new Promise((resolve, reject) => {
          const readStream = fs.createReadStream(tempPath);
          const stream = cloudinary.uploader.upload_stream(
            { folder: 'emorii_verifications/videos', resource_type: 'video', type: 'authenticated' },
            (error, result) => (error ? reject(error) : resolve(result))
          );
          readStream.pipe(stream);
        });
        publicId = uploaded.public_id;
        videoUrl = cloudinary.url(publicId, {
          sign_url: true,
          type: 'authenticated',
          resource_type: 'video',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        storage  = 'cloudinary';
        fs.unlink(tempPath, () => {});
      } catch (cloudError) {
        logger.error('[upload-verification-video] Cloudinary upload failed:', cloudError.message);
      }
    }

    if (!videoUrl) {
      const fileName = path.basename(tempPath);
      videoUrl = `/public/verification-videos/${fileName}`;
      storage  = 'local';
    }

    user.verificationStatus           = 'pending';
    user.verificationVideoUrl         = videoUrl;
    user.verificationVideo            = { url: videoUrl, publicId, storedAt: new Date(), storage };
    user.verificationRequestDate      = new Date();
    user.verificationRejectionReason  = null;
    await user.save();
    await redis.del(`profile:me:${user._id}`);

    return res.json({
      success:  true,
      message:  'Verification video uploaded successfully',
      status:   'pending',
      videoUrl,
    });
  } catch (error) {
    logger.error('[upload-verification-video] Error:', error.message);
    if (tempPath) fs.unlink(tempPath, () => {});
    return res.status(500).json({ success: false, message: 'Verification video upload failed' });
  }
};

const handleMulterError = (err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'Video file is too large. Maximum size is 300 MB.' });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message || 'Upload error' });
  }
  next();
};

router.post(
  '/upload-verification-video',
  protect,
  (req, res, next) => uploadVideo.single('video')(req, res, (err) => handleMulterError(err, req, res, next)),
  handleVerificationVideoUpload
);

router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('verified isFaceVerified verificationStatus verificationRequestDate verificationApprovedAt verificationRejectionReason');
    res.json({
      success: true,
      data: {
        verified:         user.verified || false,
        isFaceVerified:   user.isFaceVerified || false,
        status:           user.verificationStatus || 'not_requested',
        requestDate:      user.verificationRequestDate || null,
        approvedAt:       user.verificationApprovedAt || null,
        rejectionReason:  user.verificationRejectionReason || null,
      },
    });
  } catch (error) {
    logger.error('Verification status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/pending', protect, isAdmin, async (req, res) => {
  try {
    const verifications = await User.find({ verificationStatus: 'pending' })
      .select('_id name email age gender bio photos verificationVideoUrl verificationVideo selfiePhoto verificationRequestDate livingIn jobTitle interests');

    const signed = verifications.map(v => {
      const obj = v.toObject();
      if (obj.verificationVideo?.publicId) {
        const signedUrl = cloudinary.url(obj.verificationVideo.publicId, {
          sign_url: true,
          type: 'authenticated',
          resource_type: 'video',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        obj.verificationVideoUrl = signedUrl;
        obj.verificationVideo.url = signedUrl;
      }
      if (obj.selfiePhoto?.publicId) {
        obj.selfiePhoto.url = cloudinary.url(obj.selfiePhoto.publicId, {
          sign_url: true,
          type: 'authenticated',
          resource_type: 'image',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
      }
      return obj;
    });

    res.json({ success: true, verifications: signed });
  } catch (error) {
    logger.error('Get pending verifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:userId/approve', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.verified                    = true;
    user.isFaceVerified              = true;
    user.verificationStatus          = 'approved';
    user.verificationApprovedBy      = req.user._id;
    user.verificationApprovedAt      = new Date();
    user.verificationRejectionReason = null;
    await user.save();
    await redis.del(`profile:me:${user._id}`);
    // Wipe every discoverer's cached `/users/nearby` result so the newly
    // approved user becomes visible to others within seconds rather than
    // waiting up to 2 minutes for the per-key TTL to expire.
    await redis.delPattern('discovery:*');

    try {
      const { sendVerificationApprovedEmail } = require('../utils/emailService');
      await sendVerificationApprovedEmail(user.email, user.name);
    } catch (emailError) {
      logger.error('Failed to send verification approved email:', emailError);
    }

    try {
      if (user.pushToken && user.pushNotificationsEnabled !== false) {
        const { sendExpoPushNotification } = require('../utils/pushNotifications');
        await sendExpoPushNotification(user.pushToken, {
          title: '✅ Verification Approved!',
          body: 'Congratulations! Your face verification has been approved. You can now discover and connect with other users.',
          data: { type: 'verification_approved', screen: 'Discovery' },
          channelId: 'default',
          priority: 'high',
        });
      }
    } catch (pushError) {
      logger.error('Failed to send verification approved push notification:', pushError);
    }

    try {
      const io = req.app.get('io');
      if (io) {
        io.to(user._id.toString()).emit('user:verified', {
          userId: user._id.toString(),
          verified: true,
          verificationStatus: 'approved',
        });

        // Fire-and-forget: notify nearby exhausted users so the newly
        // approved member shows up in their discovery deck immediately.
        const freshUser = await User.findById(user._id).lean();
        notifyExhaustedUsersOfNewMember(freshUser, io).catch(() => {});
      }
    } catch (socketError) {
      logger.error('Failed to emit verification socket event:', socketError);
    }

    res.json({
      success: true,
      message: 'User verified successfully',
      user: { _id: user._id, name: user.name, email: user.email, verified: true },
    });
  } catch (error) {
    logger.error('Approval error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:userId/reject', protect, isAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.isFaceVerified              = false;
    user.verified                    = false;
    user.verificationStatus          = 'rejected';
    user.verificationRejectionReason = reason || 'Video does not meet requirements';
    user.verificationApprovedAt      = null;
    await user.save();
    await redis.del(`profile:me:${user._id}`);

    try {
      const { sendVerificationRejectedEmail } = require('../utils/emailService');
      await sendVerificationRejectedEmail(user.email, user.name, reason);
    } catch (emailError) {
      logger.error('Failed to send verification rejection email:', emailError);
    }

    try {
      if (user.pushToken && user.pushNotificationsEnabled !== false) {
        const { sendExpoPushNotification } = require('../utils/pushNotifications');
        const rejectionMsg = reason
          ? `Reason: ${reason}. Please try again with a clearer video.`
          : 'Please try again with a clearer video in good lighting.';
        await sendExpoPushNotification(user.pushToken, {
          title: '❌ Verification Not Approved',
          body: rejectionMsg,
          data: { type: 'verification_rejected', screen: 'Verification' },
          channelId: 'default',
          priority: 'high',
        });
      }
    } catch (pushError) {
      logger.error('Failed to send verification rejected push notification:', pushError);
    }

    res.json({
      success: true,
      message: 'Verification rejected',
      user: { _id: user._id, name: user.name, email: user.email, status: 'rejected' },
    });
  } catch (error) {
    logger.error('Rejection error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/request', protect, upload.fields([{ name: 'selfiePhoto', maxCount: 1 }]), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.verified && user.verificationStatus === 'approved') {
      return res.status(400).json({ success: false, message: 'Already verified' });
    }
    const files = req.files;
    if (!files || !files.selfiePhoto || !files.selfiePhoto[0]) {
      return res.status(400).json({ success: false, message: 'Selfie photo required' });
    }
    const selfieResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'emorii_verifications/selfies', type: 'authenticated' },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      stream.end(files.selfiePhoto[0].buffer);
    });
    const selfieSignedUrl = cloudinary.url(selfieResult.public_id, {
      sign_url: true,
      type: 'authenticated',
      resource_type: 'image',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
    user.verificationStatus = 'pending';
    user.selfiePhoto = { url: selfieSignedUrl, publicId: selfieResult.public_id, submittedAt: new Date() };
    user.verificationRequestDate = new Date();
    await user.save();
    await redis.del(`profile:me:${user._id}`);
    res.json({ success: true, message: 'Verification request submitted', status: 'pending' });
  } catch (error) {
    logger.error('Verification request error:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

module.exports = router;
