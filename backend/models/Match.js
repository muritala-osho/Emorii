
const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  matchedAt: {
    type: Date,
    default: Date.now
  },
  isSuperLike: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'unmatched', 'blocked'],
    default: 'active'
  },
  screenshotProtection: {
    type: Boolean,
    default: false
  },
  lastMessageAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
  },
  hasFirstMessage: {
    type: Boolean,
    default: false
  },
  compatibilityScore: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

matchSchema.pre('save', async function() {
  if (this.users.length !== 2) {
    throw new Error('A match must have exactly 2 users');
  }
});

matchSchema.index({ users: 1 });
matchSchema.index({ matchedAt: -1 });
matchSchema.index({ users: 1, lastMessageAt: -1 });
matchSchema.index({ users: 1, status: 1 });
matchSchema.index({ status: 1, expiresAt: 1 });
matchSchema.index({ hasFirstMessage: 1, expiresAt: 1 });

module.exports = mongoose.model('Match', matchSchema);
