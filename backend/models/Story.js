
const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  textContent: {
    type: String
  },
  backgroundColor: {
    type: String,
    default: '#FE3C72'
  },
  mediaUrl: {
    type: String
  },
  imageUrl: {
    type: String
  },
  thumbnail: {
    type: String
  },
  views: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  durationHours: {
    type: Number,
    default: 24
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ user: 1, expiresAt: 1 });
storySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Story', storySchema);
