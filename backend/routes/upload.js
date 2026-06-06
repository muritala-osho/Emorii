const logger = require('../utils/logger');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const { protect } = require('../middleware/auth');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadBufferToCloudinary = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

const storage = multer.memoryStorage();

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// H-7: Explicit video/audio allowlists replace the old startsWith('image/')
// / startsWith('video/') prefix checks. MIME types are client-supplied and
// trivially spoofable; a prefix match would admit image/svg+xml (scriptable)
// or crafted types that bypass Cloudinary's content policies.
const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp', 'video/3gpp2',
  'video/x-msvideo', 'video/mpeg',
]);
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/x-caf',
  'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac', 'audio/mp4a-latm',
  'audio/3gpp', 'audio/3gpp2', 'audio/amr', 'video/mp4', 'video/quicktime',
  'application/octet-stream',
]);
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const BLOCKED_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll', '.scr', '.js', '.vbs']);

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_AUDIO_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// H-7: All fileFilter functions now use explicit Sets (.has()) instead of
// prefix checks (.startsWith('image/')) or array .includes(). MIME types are
// client-supplied; a prefix match admits SVG (scriptable), crafted types, and
// any future type the client invents. An allowlist permits only exactly what we
// expect and rejects everything else.

const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'), false);
    }
  },
});

const audioUpload = multer({
  storage,
  limits: { fileSize: MAX_AUDIO_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files (MP3, M4A, WAV, WebM, OGG) are allowed'), false);
    }
  },
});

const fileUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = '.' + file.originalname.split('.').pop().toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return cb(new Error('This file type is not allowed for security reasons'), false);
    }
    if (ALLOWED_FILE_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported. Allowed: PDF, DOC, DOCX only'), false);
    }
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB for video
  fileFilter: (req, file, cb) => {
    // H-7: explicit per-type allowlists instead of startsWith prefix check
    if (ALLOWED_IMAGE_TYPES.has(file.mimetype) || ALLOWED_VIDEO_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  },
});

const multiUpload = (req, res, next) => {
  upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
    { name: 'file',  maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      if (err.message === 'Request aborted' || err.code === 'ECONNRESET') {
        logger.warn('Upload request aborted by client (connection dropped)');
        if (!res.headersSent) {
          return res.status(499).json({ success: false, message: 'Upload cancelled' });
        }
        return;
      }
      logger.error('Multer error:', err);
      return res.status(400).json({ success: false, message: err.message });
    }

    if (req.files && typeof req.files === 'object') {
      req.file =
        req.files.photo?.[0] ||
        req.files.image?.[0] ||
        req.files.video?.[0] ||
        req.files.audio?.[0] ||
        req.files.file?.[0] ||
        null;
    }

    next();
  });
};

router.post('/photo', protect, multiUpload, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      logger.log('No file in photo request:', { body: req.body, files: !!req.files, file: !!req.file });
      return res.status(400).json({ success: false, message: 'No photo uploaded' });
    }

    const compressedBuffer = await sharp(file.buffer)
      .resize(1200, 1500, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({
        quality: 85,
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();

    const result = await uploadBufferToCloudinary(compressedBuffer, {
      folder: 'emorii/profiles',
      resource_type: 'image',
      transformation: [
        { width: 800, height: 1000, crop: 'fill', gravity: 'face' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ],
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      originalSize: req.file.size,
      compressedSize: compressedBuffer.length
    });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
});

router.post('/chat-image', protect, multiUpload, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No image uploaded' });
    }

    const compressedBuffer = await sharp(file.buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    const result = await uploadBufferToCloudinary(compressedBuffer, {
      folder: 'emorii/chat-images',
      resource_type: 'image',
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    logger.error('Chat image upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
});

router.post('/chat-video', protect, multiUpload, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No video uploaded' });
    }

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: 'emorii/chat-videos',
      resource_type: 'video',
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    logger.error('Chat video upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
});

const handleAudioUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    if (req.file.size > MAX_AUDIO_SIZE) {
      return res.status(400).json({ 
        success: false, 
        message: `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE / (1024 * 1024)}MB` 
      });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'emorii/voice-notes',
      resource_type: 'video',
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      duration: result.duration || req.body.duration || 0,
      size: req.file.size,
    });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
};

const audioMultiUpload = (req, res, next) => {
  audioUpload.any()(req, res, (err) => {
    if (err) {
      if (err.message === 'Request aborted' || err.code === 'ECONNRESET') {
        logger.warn('Audio upload request aborted by client');
        if (!res.headersSent) {
          return res.status(499).json({ success: false, message: 'Upload cancelled' });
        }
        return;
      }
      logger.error('Audio multer error:', err);
      return res.status(400).json({ success: false, message: err.message });
    }
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

router.post('/voice', protect, audioMultiUpload, handleAudioUpload);
router.post('/audio', protect, audioMultiUpload, handleAudioUpload);

router.delete('/photo', protect, async (req, res) => {
  try {
    const publicId = req.query.publicId || req.body.publicId;
    const User = require('../models/User');
    
    if (!publicId) {
      return res.status(400).json({ success: false, message: 'Photo ID required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const photoExists = user.photos.some(photo => 
      photo.publicId === publicId || photo._id?.toString() === publicId
    );

    if (!photoExists) {
      return res.status(403).json({ success: false, message: 'Photo not found or not authorized' });
    }

    user.photos = user.photos.filter(photo => 
      photo.publicId !== publicId && photo._id?.toString() !== publicId
    );
    
    if (user.photos.length > 0 && !user.photos.some(p => p.isPrimary)) {
      user.photos[0].isPrimary = true;
    }
    
    await user.save();

    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (cloudinaryError) {
      logger.log('Cloudinary delete error (may not exist):', cloudinaryError.message);
    }

    res.json({ success: true, message: 'Photo deleted successfully' });
  } catch (error) {
    logger.error('Delete photo error:', error);
    res.status(500).json({ success: false, message: error.message || 'Delete failed' });
  }
});

router.post('/file', protect, fileUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const ext = '.' + req.file.originalname.split('.').pop().toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({ 
        success: false, 
        message: 'This file type is not allowed for security reasons' 
      });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'emorii/files',
      // H-8: Use 'raw' instead of 'auto' for document uploads. 'auto' lets
      // Cloudinary sniff the content type and may treat a crafted PDF as a
      // video, bypassing the raw-file delivery restrictions. Documents (PDF,
      // DOC, DOCX) must always be served as raw assets, not transformed media.
      resource_type: 'raw',
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
    });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
});


router.post('/video', protect, multiUpload, async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No video uploaded' });
    }

    logger.log('Video upload starting for:', file.originalname);

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: 'emorii/stories',
      resource_type: 'auto',
    });

    res.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id
    });
  } catch (error) {
    logger.error('Video upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
});

router.post('/voice-bio', protect, audioUpload.single('audio'), async (req, res) => {
  try {
    const User = require('../models/User');
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No audio file uploaded' });
    }

    const MAX_VOICE_BIO_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_VOICE_BIO_SIZE) {
      return res.status(400).json({ success: false, message: 'Voice bio must be under 5MB (30 seconds)' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.voiceBio?.publicId) {
      try {
        await cloudinary.uploader.destroy(user.voiceBio.publicId, { resource_type: 'video' });
      } catch (e) {
        logger.log('Could not delete old voice bio from cloudinary:', e.message);
      }
    }

    const result = await uploadBufferToCloudinary(file.buffer, {
      folder: 'emorii/voice-bios',
      resource_type: 'video',
      format: 'mp3',
    });

    // L-4: Clamp duration to a valid positive range (0–300 s). Reject Infinity,
    // NaN, and negative values that a client could otherwise smuggle in.
    const rawDuration = parseFloat(req.body.duration);
    const duration = Number.isFinite(rawDuration) ? Math.min(Math.max(rawDuration, 0), 300) : 0;

    user.voiceBio = { url: result.secure_url, publicId: result.public_id, duration };
    await user.save();

    res.json({ success: true, url: result.secure_url, publicId: result.public_id, duration });
  } catch (error) {
    logger.error('Voice bio upload error:', error);
    res.status(500).json({ success: false, message: error.message || 'Upload failed' });
  }
});

router.delete('/voice-bio', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.voiceBio?.publicId) {
      try {
        await cloudinary.uploader.destroy(user.voiceBio.publicId, { resource_type: 'video' });
      } catch (e) {
        logger.log('Could not delete voice bio from cloudinary:', e.message);
      }
    }

    user.voiceBio = { url: null, publicId: null, duration: 0 };
    await user.save();
    res.json({ success: true, message: 'Voice bio removed' });
  } catch (error) {
    logger.error('Voice bio delete error:', error);
    res.status(500).json({ success: false, message: error.message || 'Delete failed' });
  }
});

module.exports = router;
