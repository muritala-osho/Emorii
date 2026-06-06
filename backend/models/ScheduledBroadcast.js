const mongoose = require('mongoose');

const scheduledBroadcastSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
  },
  body: {
    type: String,
    required: true,
    trim: true,
    maxlength: 150,
  },
  imageUrl: {
    type: String,
    default: null,
  },
  target: {
    type: String,
    enum: ['all', 'male', 'female', 'verified', 'platinum', 'gold', 'lagos', 'london'],
    default: 'all',
  },
  scheduledAt: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'fired', 'cancelled', 'failed'],
    default: 'pending',
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  createdByName: {
    type: String,
  },
  firedAt: {
    type: Date,
    default: null,
  },
  cancelledAt: {
    type: Date,
    default: null,
  },
  cancelledByName: {
    type: String,
    default: null,
  },
  reach: {
    type: Number,
    default: 0,
  },
  errorMessage: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

scheduledBroadcastSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('ScheduledBroadcast', scheduledBroadcastSchema);
