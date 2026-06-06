const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    refreshTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    // Refresh-token rotation with a grace window.
    // When /refresh issues a NEW refresh token, the previous one stays valid
    // for ~60s so a duplicate request from a slow/retrying client (network
    // hiccup mid-response, two parallel cold-start requests, app force-quit
    // between request and SecureStore write) does NOT log the user out.
    // After the grace window the previous hash is rejected and rotation has
    // its full security benefit (a leaked refresh token becomes useless once
    // it's been used and 60s have passed).
    previousRefreshTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    previousRefreshTokenExpiresAt: {
      type: Date,
      default: null,
    },
    deviceName: {
      type: String,
      default: 'Unknown Device',
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web', 'unknown'],
      default: 'unknown',
    },
    ipAddress: {
      type: String,
      default: null,
    },
    city: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: null,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

sessionSchema.index({ lastActive: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Session', sessionSchema);
