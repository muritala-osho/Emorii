const mongoose = require('mongoose');

const boostSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['standard', 'super', 'premium'],
    default: 'standard'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  },
  multiplier: {
    type: Number,
    default: 2, 
    min: 1,
    max: 10
  },
  viewsGained: {
    type: Number,
    default: 0
  },
  likesGained: {
    type: Number,
    default: 0
  },
  matchesGained: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  source: {
    type: String,
    enum: ['purchase', 'reward', 'promo', 'subscription'],
    default: 'purchase'
  }
}, { timestamps: true });

boostSchema.index({ userId: 1, isActive: 1, expiresAt: 1 });
boostSchema.index({ expiresAt: 1 }); 

boostSchema.statics.getActiveBoost = async function(userId) {
  const now = new Date();
  return this.findOne({
    userId,
    isActive: true,
    expiresAt: { $gt: now }
  });
};

boostSchema.statics.getBoostedUserIds = async function() {
  const now = new Date();
  const activeBoosts = await this.find({
    isActive: true,
    expiresAt: { $gt: now }
  }).select('userId multiplier');
  
  const boostMap = new Map();
  activeBoosts.forEach(boost => {
    boostMap.set(boost.userId.toString(), boost.multiplier);
  });
  return boostMap;
};

boostSchema.methods.checkActive = function() {
  const now = new Date();
  if (this.expiresAt <= now) {
    this.isActive = false;
  }
  return this.isActive;
};

boostSchema.methods.incrementStat = async function(stat, amount = 1) {
  if (['viewsGained', 'likesGained', 'matchesGained'].includes(stat)) {
    this[stat] += amount;
    await this.save();
  }
};

module.exports = mongoose.model('Boost', boostSchema);
