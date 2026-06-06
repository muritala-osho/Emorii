const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'BAN_USER', 'UNBAN_USER',
        'SUSPEND_USER', 'UNSUSPEND_USER',
        'DELETE_USER',
        'APPROVE_VERIFICATION', 'REJECT_VERIFICATION',
        'RESOLVE_REPORT',
        'APPROVE_APPEAL', 'REJECT_APPEAL',
        'REMOVE_CONTENT', 'APPROVE_CONTENT',
        'SEND_BROADCAST',
        'UPDATE_SETTINGS',
        'CLOSE_TICKET', 'REPLY_TICKET',
        'SAFETY_WARNING_BYPASSED',
        'LIFT_MESSAGING_PAUSE',
      ],
    },
    category: {
      type: String,
      required: true,
      enum: ['USER_MANAGEMENT', 'VERIFICATION', 'MODERATION', 'BROADCAST', 'APPEAL', 'SYSTEM', 'SUPPORT', 'USER_SAFETY'],
    },
    severity: {
      type: String,
      default: 'medium',
      enum: ['low', 'medium', 'high', 'critical'],
    },
    // For admin actions these hold the admin's identity. For user-triggered
    // safety events (USER_SAFETY category) these hold the acting user instead.
    adminId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    adminName:  { type: String, required: false },
    adminEmail: { type: String },

    targetUserId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    targetUserName:  { type: String },
    targetUserEmail: { type: String },

    details:  { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },

    ipAddress: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ severity: 1, createdAt: -1 });
auditLogSchema.index({ targetUserId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
