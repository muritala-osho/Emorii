const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: ['lifestyle', 'values', 'personality', 'relationship', 'future'],
    required: true
  },
  options: [{
    text: { type: String, required: true },
    value: { type: Number, required: true } 
  }],
  weight: {
    type: Number,
    default: 1, 
    min: 1,
    max: 3
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const userQuizResponseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  responses: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuizQuestion',
      required: true
    },
    selectedOption: {
      text: String,
      value: Number
    },
    answeredAt: {
      type: Date,
      default: Date.now
    }
  }],
  completedAt: {
    type: Date,
    default: null
  },
  totalQuestions: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

userQuizResponseSchema.index({ userId: 1 }, { unique: true });

const QuizQuestion = mongoose.model('QuizQuestion', quizQuestionSchema);
const UserQuizResponse = mongoose.model('UserQuizResponse', userQuizResponseSchema);

module.exports = { QuizQuestion, UserQuizResponse };
