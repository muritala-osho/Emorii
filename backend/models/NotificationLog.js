const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    recipientEmail: { type: String, default: null },
    recipientTokenTail: { type: String, default: null },

    channel: {
      type: String,
      enum: ['email', 'push', 'inapp', 'socket'],
      required: true,
      index: true,
    },
    type: { type: String, default: 'system', index: true },

    subject: { type: String, default: '' },
    body: { type: String, default: '' },

    status: {
      type: String,
      enum: ['sent', 'delivered', 'opened', 'failed', 'bounced', 'suppressed'],
      default: 'sent',
      index: true,
    },

    providerId: { type: String, default: null },
    errorMessage: { type: String, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationLogSchema.index({ recipient: 1, createdAt: -1 });
notificationLogSchema.index({ recipient: 1, channel: 1, createdAt: -1 });
// Receipt poller sweep: channel=push, status=sent, providerId!=null, createdAt in range
notificationLogSchema.index({ channel: 1, status: 1, createdAt: 1, providerId: 1 });

module.exports = mongoose.model('NotificationLog', notificationLogSchema);
