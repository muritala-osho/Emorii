const mongoose = require('mongoose');

const successStorySchema = new mongoose.Schema({
  couple: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150
  },
  story: {
    type: String,
    required: true,
    maxlength: 5000
  },
  howWeMet: {
    type: String,
    maxlength: 500
  },
  firstMessage: {
    type: String,
    maxlength: 500
  },
  relationship: {
    type: String,
    enum: ['dating', 'engaged', 'married', 'partners'],
    required: true
  },
  matchDate: {
    type: Date
  },
  milestoneDate: {
    type: Date
  },
  photos: [{
    url: String,
    publicId: String,
    caption: String
  }],
  featured: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectionReason: String,
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likeCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true
  }],
  location: {
    city: String,
    country: String
  },
  isAnonymous: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

successStorySchema.index({ status: 1, createdAt: -1 });
successStorySchema.index({ featured: 1, likeCount: -1 });

module.exports = mongoose.model('SuccessStory', successStorySchema);
