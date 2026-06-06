const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema({
  _singleton: { type: String, default: 'global', unique: true },
  appName: { type: String, default: 'Emorii' },
  maintenanceMode: { type: Boolean, default: false },
  maxDailySwipes: { type: Number, default: 50 },
  maxPhotos: { type: Number, default: 9 },
  minAge: { type: Number, default: 18 },
  maxAge: { type: Number, default: 65 },
  matchingRadius: { type: Number, default: 100 },
  premiumMatchBoost: { type: Number, default: 3 },
  allowGuestBrowsing: { type: Boolean, default: false },
  requireEmailVerification: { type: Boolean, default: true },
  aiModerationEnabled: { type: Boolean, default: true },
  reportThreshold: { type: Number, default: 5 },
  signupBonusCoins: { type: Number, default: 100 },
  newRegistration: { type: Boolean, default: true },
  emailNotifications: { type: Boolean, default: true },
}, { timestamps: true });

appSettingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne({ _singleton: 'global' });
  if (!doc) {
    doc = await this.create({ _singleton: 'global' });
  }
  return doc.toObject();
};

appSettingsSchema.statics.updateSettings = async function (updates) {
  const ALLOWED = [
    'appName', 'maintenanceMode', 'maxDailySwipes', 'maxPhotos',
    'minAge', 'maxAge', 'matchingRadius', 'premiumMatchBoost',
    'allowGuestBrowsing', 'requireEmailVerification',
    'aiModerationEnabled', 'reportThreshold', 'signupBonusCoins',
    'newRegistration', 'emailNotifications',
  ];
  const safe = {};
  ALLOWED.forEach(k => { if (k in updates) safe[k] = updates[k]; });
  const doc = await this.findOneAndUpdate(
    { _singleton: 'global' },
    { $set: safe },
    { upsert: true, new: true }
  );
  return doc.toObject();
};

module.exports = mongoose.model('AppSettings', appSettingsSchema);
