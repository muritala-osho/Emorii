
const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['profile_view', 'swipe_right', 'swipe_left', 'super_like', 'message_sent', 'match_created'],
    required: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

activitySchema.index({ userId: 1, type: 1, timestamp: -1 });
activitySchema.index({ targetUserId: 1, timestamp: -1 });

module.exports = mongoose.model('Activity', activitySchema);
