const mongoose = require('mongoose');

const profilePromptSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['personality', 'lifestyle', 'dating', 'fun', 'deep'],
    required: true
  },
  question: {
    type: String,
    required: true,
    maxlength: 200
  },
  placeholder: {
    type: String,
    maxlength: 100
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const userPromptResponseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  promptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProfilePrompt',
    required: true
  },
  answer: {
    type: String,
    required: true,
    maxlength: 500
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

userPromptResponseSchema.index({ userId: 1, promptId: 1 }, { unique: true });
userPromptResponseSchema.index({ userId: 1, order: 1 });

const ProfilePrompt = mongoose.model('ProfilePrompt', profilePromptSchema);
const UserPromptResponse = mongoose.model('UserPromptResponse', userPromptResponseSchema);

module.exports = { ProfilePrompt, UserPromptResponse };
