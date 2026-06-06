
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Please provide the user ID of the reported user'],
  },
  reason: {
    type: String,
    required: [true, 'Please provide a reason for the report'],
  },
  description: {
    type: String,
    maxlength: 500
  },
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match'
  },
  contentType: {
    type: String,
    enum: [
      'user',
      'profile_photo',
      'story',
      'message_image',
      'message_text',
      'message_audio',
      'message_video',
      'comment',
      'voice_bio',
      'success_story',
      'bio'
    ],
    default: 'user'
  },
  contentId: {
    type: String
  },
  contentUrl: {
    type: String
  },
  contentPreview: {
    type: String
  },
  contentMeta: {
    type: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved'],
    default: 'pending'
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date,
  adminNotes: String
}, {
  timestamps: true
});

reportSchema.index({ reportedUser: 1, status: 1 });
reportSchema.index({ reportedBy: 1, createdAt: -1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ contentType: 1, status: 1 });

reportSchema.pre(/^find/, function (next) {
  this.populate('reportedBy').populate('reporter').populate('reportedUser');
  next();
});

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);
