const mongoose = require('mongoose');

const iceBreakerSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['general', 'music', 'movies', 'food', 'travel', 'sports', 'hobbies', 'dating', 'lifestyle'],
    required: true
  },
  question: {
    type: String,
    required: true,
    maxlength: 300
  },
  relatedInterests: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

iceBreakerSchema.index({ category: 1, isActive: 1 });
iceBreakerSchema.index({ relatedInterests: 1 });

module.exports = mongoose.model('IceBreaker', iceBreakerSchema);
