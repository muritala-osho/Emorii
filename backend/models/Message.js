
const mongoose = require('mongoose');

const replyToSchema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  content: { type: String },
  type: { type: String },
  senderName: { type: String }
}, { _id: false });

const storyReactionSchema = new mongoose.Schema({
  storyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
  emoji: { type: String },
  storyType: { type: String },
  storyPreview: { type: String }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true
  },
  sender: {
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
    enum: ['text', 'image', 'video', 'audio', 'file', 'system', 'story_reaction', 'story_reply', 'call', 'location'],
    default: 'text'
  },
  callType: {
    type: String,
    enum: ['video', 'audio', 'voice']
  },
  callStatus: {
    type: String,
    enum: ['missed', 'declined', 'completed']
  },
  callDuration: {
    type: Number
  },
  content: {
    type: String,
    required: function() {
      return this.type === 'text' || this.type === 'system';
    }
  },
  edited: { type: Boolean, default: false },
  editedAt: { type: Date },
  imageUrl: {
    type: String
  },
  videoUrl: {
    type: String
  },
  audioUrl: {
    type: String
  },
  audioDuration: {
    type: Number
  },
  fileUrl: {
    type: String
  },
  fileName: {
    type: String
  },
  fileSize: {
    type: Number
  },
  fileType: {
    type: String
  },
  latitude: {
    type: Number
  },
  longitude: {
    type: Number
  },
  address: {
    type: String
  },
  liveExpiresAt: {
    type: Date,
    default: null
  },
  lastLocationUpdate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'seen'],
    default: 'sent'
  },
  seen: {
    type: Boolean,
    default: false
  },
  seenAt: {
    type: Date
  },
  deliveredAt: {
    type: Date
  },
  deletedFor: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  deletedForEveryone: {
    type: Boolean,
    default: false
  },
  storyReaction: storyReactionSchema,
  replyTo: replyToSchema,
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String }
  }],
  viewOnce: {
    type: Boolean,
    default: false
  },
  viewOnceOpenedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  originalText: { type: String, default: null },
  detectedLanguage: { type: String, default: null },
  translatedText: { type: String, default: null },
  targetLanguage: { type: String, default: null },
  translationStatus: {
    type: String,
    enum: ['pending', 'done', 'failed', 'skipped'],
    default: null,
  },
}, {
  timestamps: true
});

messageSchema.index({ matchId: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ receiver: 1 });
messageSchema.index({ receiver: 1, seen: 1 }); // badge count: countDocuments({ receiver, seen: false })
messageSchema.index({ matchId: 1, receiver: 1, seen: 1 });
messageSchema.index({ matchId: 1, deletedFor: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
