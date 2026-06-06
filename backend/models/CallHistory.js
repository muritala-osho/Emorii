
const mongoose = require('mongoose');

const callHistorySchema = new mongoose.Schema({
  caller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['video', 'audio'],
    required: true
  },
  status: {
    type: String,
    enum: ['completed', 'missed', 'rejected', 'failed', 'ongoing'],
    default: 'completed'
  },
  duration: {
    type: Number,
    default: 0
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date
  },
  qualityRating: {
    type: Number,
    min: 1,
    max: 5
  }
}, {
  timestamps: true
});

callHistorySchema.index({ caller: 1, createdAt: -1 });
callHistorySchema.index({ receiver: 1, createdAt: -1 });

module.exports = mongoose.model('CallHistory', callHistorySchema);
