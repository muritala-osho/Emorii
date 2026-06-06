const mongoose = require('mongoose');

const adminPushSubscriptionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  adminEmail: { type: String, required: true },
  endpoint: { type: String, required: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastUsed: { type: Date, default: Date.now },
});

adminPushSubscriptionSchema.index({ adminId: 1 });
adminPushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.model('AdminPushSubscription', adminPushSubscriptionSchema);
