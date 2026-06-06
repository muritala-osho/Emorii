const mongoose = require('mongoose');

const broadcastLogSchema = new mongoose.Schema({
  broadcastId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  target: { type: String, default: 'all' },
  imageUrl: { type: String, default: null },
  status: { type: String, enum: ['sent', 'scheduled', 'failed'], default: 'sent' },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reach: { type: Number, default: 0 },
  actualSent: { type: Number, default: null },
  openRate: { type: String, default: '0%' },
}, { timestamps: true });

broadcastLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BroadcastLog', broadcastLogSchema);
