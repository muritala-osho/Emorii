const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'admin', 'agent'], required: true },
  content: { type: String, required: true },
  senderName: { type: String }, // display name of whoever sent the message
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminName: { type: String },
  timestamp: { type: Date, default: Date.now },
});

const supportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    subject: { type: String, required: true },
    category: {
      type: String,
      enum: ['billing', 'account', 'technical', 'safety', 'other'],
      default: 'other',
    },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: {
      type: String,
      enum: ['open', 'pending', 'in-progress', 'closed'],
      default: 'open',
    },
    messages: [messageSchema],

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date },

    unreadByUser: { type: Number, default: 0 }, // replies user hasn't read yet
    unreadByAgent: { type: Number, default: 0 }, // new user messages agent hasn't read

    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ userId: 1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
