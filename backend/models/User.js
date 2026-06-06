
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  verificationOTP: { type: String, select: false },
  verificationOTPExpire: { type: Date, select: false },
  resetPasswordOTP: { type: String, select: false },
  resetPasswordOTPExpire: { type: Date, select: false },
  tokenVersion: {
    type: Number,
    default: 0,
    select: false
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    select: false
  },
  googleId: {
    type: String,
    sparse: true
  },
  age: {
    type: Number,
    required: true,
    min: 18,
    max: 100
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'man', 'woman', 'non-binary', 'prefer_not_to_say'],
    required: true
  },
  zodiacSign: {
    type: String,
    enum: ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'],
    default: null
  },
  height: {
    type: Number,
    min: 100,
    max: 250,
    default: null
  },
  jobTitle: {
    type: String,
    maxlength: 100,
    trim: true,
    default: ''
  },
  education: {
    type: String,
    enum: ['high_school', 'some_college', 'bachelors', 'masters', 'doctorate', 'trade_school', 'other', 'prefer_not_to_say'],
    default: null
  },
  school: {
    type: String,
    maxlength: 150,
    trim: true,
    default: ''
  },
  livingIn: {
    type: String,
    maxlength: 100,
    trim: true,
    default: ''
  },
  bio: {
    type: String,
    maxlength: 500,
    default: ''
  },
  favoriteSong: {
    title: { type: String, maxlength: 200, default: '' },
    artist: { type: String, maxlength: 200, default: '' },
    spotifyUri: { type: String, default: '' },
    albumArt: { type: String, default: '' },
    previewUrl: { type: String, default: '' }
  },
  spotify: {
    connected: { type: Boolean, default: false },
    userId: { type: String, default: '' },
    displayName: { type: String, default: '' },
    accessToken: { type: String, default: '' },
    refreshToken: { type: String, default: '' },
    tokenExpiry: { type: Date, default: null }
  },
  interests: [{
    type: String,
    trim: true
  }],
  photos: [{
    url: String,
    publicId: String,
    isPrimary: {
      type: Boolean,
      default: false
    },
    privacy: {
      type: String,
      enum: ['public', 'friends', 'private'],
      default: 'public'
    },
    order: {
      type: Number,
      default: 0
    }
  }],
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], 
      default: [0, 0]
    },
    city: String,
    country: String
  },
  passportLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: [Number],
    city: String,
    country: String,
    isActive: { type: Boolean, default: false }
  },
  locationSharingEnabled: {
    type: Boolean,
    default: true
  },
  locationUpdatedAt: {
    type: Date,
    default: Date.now
  },
  liveLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: undefined
    },
    city: String,
    country: String,
    accuracy: Number
  },
  liveLocationUpdatedAt: {
    type: Date,
    default: null
  },
  autoUpdateProfileLocation: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  isFaceVerified: {
    type: Boolean,
    default: false,
    index: true,
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  expireAt: {
    type: Date,
    index: { expires: '30m' },
    default: function() {
      return this.emailVerified ? undefined : new Date();
    }
  },
  verificationStatus: {
    type: String,
    enum: ['none', 'not_requested', 'pending', 'approved', 'rejected'],
    default: 'not_requested'
  },
  verificationHistory: [{
    action: {
      type: String,
      enum: ['approved', 'rejected', 'revoked']
    },
    reason: String,
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  verificationPhoto: {
    type: String,
    default: null
  },
  idPhoto: {
    url: String,
    publicId: String,
    submittedAt: Date
  },
  selfiePhoto: {
    url: String,
    publicId: String,
    submittedAt: Date,
    poseChallenge: {
      id: String,
      instruction: String,
      emoji: String
    }
  },
  verificationVideoUrl: {
    type: String,
    default: null
  },
  verificationVideo: {
    url:               { type: String,  default: null },
    publicId:          { type: String,  default: null },
    storedAt:          { type: Date,    default: null },
    storage:           { type: String,  enum: ['cloudinary', 'local'], default: null },
    challengeOrder:    { type: [String], default: null },
    antiSpoofScore:    { type: Number,  default: null },
    antiSpoofReal:     { type: Boolean, default: null },
    antiSpoofAt:       { type: Date,    default: null },
    faceMatchScore:    { type: Number,  default: null },
    faceMatchVerified: { type: Boolean, default: null },
    faceMatchAt:       { type: Date,    default: null },
  },
  verificationRequestDate: {
    type: Date,
    default: null
  },
  verificationApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  verificationApprovedAt: {
    type: Date,
    default: null
  },
  verificationRejectionReason: {
    type: String,
    default: null
  },
  onlineStatus: {
    type: String,
    enum: ['online', 'offline', 'away'],
    default: 'offline'
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  // Set when the user runs out of discovery cards. The "new people are
  // waiting" cron uses this together with `lastDiscoveryWaitingNotifiedAt`
  // to decide who to notify. Cleared by the cron after the notification
  // is sent so the same user isn't pinged repeatedly.
  discoveryStackExhaustedAt: {
    type: Date,
    default: null,
  },
  lastDiscoveryWaitingNotifiedAt: {
    type: Date,
    default: null,
  },
  lookingFor: {
    type: String,
    enum: ['relationship', 'friendship', 'casual', 'networking', 'not_sure', 'not sure'],
    default: 'relationship'
  },
  relationshipGoal: {
    type: String,
    enum: ['short_term', 'long_term', 'friendship', 'networking', 'casual', 'marriage', 'open_to_everything', 'not_sure_yet'],
    default: null
  },
  preferences: {
    ageRange: {
      min: { type: Number, default: 18 },
      max: { type: Number, default: 50 }
    },
    genderPreference: {
      type: String,
      enum: ['male', 'female', 'both'],
      default: 'both'
    },
    maxDistance: {
      type: Number,
      default: 10000 
    },
    showOnlineOnly: {
      type: Boolean,
      default: false
    },
    showVerifiedOnly: {
      type: Boolean,
      default: false
    },
    dealBreakers: [{
      type: String,
      enum: ['smoking', 'drinking', 'no_kids', 'has_kids', 'pets']
    }],
    language: {
      type: String,
      enum: ['en', 'es', 'fr', 'pt', 'ar', 'sw', 'yo', 'ig', 'ha', 'zu', 'xh', 'am'],
      default: 'en'
    },
    autoTranslate: { type: Boolean, default: false },
    smoking: { type: String, default: null },
    drinking: { type: String, default: null },
    wantsKids: { type: Boolean, default: null },
    onlineNow: { type: Boolean, default: false },
    interests: [{ type: String }]
  },
  lifestyle: {
    smoking: {
      type: String,
      enum: ['never', 'socially', 'regularly', 'prefer_not_to_say', ''],
      default: null
    },
    drinking: {
      type: String,
      enum: ['never', 'socially', 'regularly', 'prefer_not_to_say', ''],
      default: null
    },
    workout: {
      type: String,
      enum: ['never', 'rarely', 'sometimes', 'often', 'daily', 'regularly', 'very_active', 'prefer_not_to_say'],
      default: null
    },
    religion: {
      type: String,
      enum: ['christian', 'muslim', 'traditional', 'atheist', 'agnostic', 'spiritual', 'deist', 'other', 'prefer_not_to_say'],
      default: null,
      trim: true
    },
    ethnicity: {
      type: String,
      maxlength: 100,
      trim: true
    },
    communicationStyle: {
      type: String,
      enum: ['introverted', 'ambiverted', 'extroverted', 'ambivert', 'big_talker', 'listener', 'texter', 'caller', 'prefer_not_to_say'],
      default: null
    },
    loveStyle: {
      type: String,
      enum: ['romantic', 'playful', 'passionate', 'intellectual', 'caring', 'adventurous', 'practical', 'selfless', 'physical', 'acts_of_service', 'words_of_affirmation', 'quality_time', 'gift_giving', 'prefer_not_to_say'],
      default: null
    },
    personalityType: {
      type: String,
      maxlength: 50,
      trim: true
    },
    hasKids: {
      type: Boolean,
      default: false
    },
    wantsKids: {
      type: Boolean
    },
    hasPets: {
      type: Boolean,
      default: false
    },
    pets: {
      type: String,
      default: ''
    },
    relationshipStatus: {
      type: String,
      default: ''
    }
  },
  swipedRight: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  swipedLeft: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastSwipeAction: {
    targetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    direction: { type: String, enum: ['right', 'left'], default: null }
  },
  superLiked: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  privacySettings: {
    showOnlineStatus: {
      type: Boolean,
      default: true
    },
    showDistance: {
      type: Boolean,
      default: true
    },
    showLastActive: {
      type: Boolean,
      default: true
    },
    hideAge: {
      type: Boolean,
      default: false
    },
    whoCanViewStories: {
      type: String,
      enum: ['friends', 'matches', 'everyone'],
      default: 'everyone'
    },
    allowMessageCopying: {
      type: Boolean,
      default: true
    }
  },
  settings: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    }
  },
  pushToken: {
    type: String,
    default: null,
  },
  pushTokenUpdatedAt: {
    type: Date,
    default: null,
  },
  voipPushToken: {
    type: String,
    default: null,
  },
  fcmToken: {
    type: String,
    default: null,
  },
  fcmTokenUpdatedAt: {
    type: Date,
    default: null,
  },
  platform: {
    type: String,
    enum: ['ios', 'android', 'web', null],
    default: null,
  },
  timezone: {
    type: String,
    default: null,
  },
  pushNotificationsEnabled: {
    type: Boolean,
    default: true,
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  isSupportAgent: {
    type: Boolean,
    default: false
  },
  banned: {
    type: Boolean,
    default: false
  },
  bannedAt: Date,
  banReason: String,
  suspended: {
    type: Boolean,
    default: false
  },
  suspendedUntil: Date,
  warnings: {
    type: Number,
    default: 0
  },
  // Auto-triggered when a user dismisses too many high-severity safety warnings.
  // Blocks outgoing chat messages but does NOT log them out — they can still
  // appeal, browse, and contact support.
  messagingPaused: {
    isPaused:        { type: Boolean, default: false },
    until:           { type: Date,    default: null  },
    reason:          { type: String,  default: null  },
    autoTriggeredAt: { type: Date,    default: null  },
    bypassCount:     { type: Number,  default: 0     },
  },
  appeal: {
    status: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none'
    },
    message: {
      type: String,
      maxlength: 1000,
      default: null
    },
    submittedAt: {
      type: Date,
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    adminResponse: {
      type: String,
      maxlength: 500,
      default: null
    },
    lastAppealRejectedAt: {
      type: Date,
      default: null
    }
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  deletionOTP: String,
  deletionOTPExpire: Date,
  inactivityEmailSentAt: Date,
  renewalReminderSentAt: Date,

  churnScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 1,
  },
  churnInterventionSentAt: Date,
  churnInterventionTier: {
    type: String,
    enum: ['none', 'push', 'email', 'boost'],
    default: 'none',
  },
  freeBoostGrantedAt: Date,

  notificationEngagement: [{
    hour:        { type: Number, min: 0, max: 23 },
    sent:        { type: Number, default: 0 },
    opened:      { type: Number, default: 0 },
    lastUpdated: { type: Date },
  }],
  lastNotificationOpenedAt: Date,
  totalNotificationOpens:   { type: Number, default: 0 },
  premium: {
    isActive: {
      type: Boolean,
      default: false
    },
    plan: {
      type: String,
      enum: ['free', 'day', 'week', 'month', 'year', 'admin_grant'],
      default: 'free'
    },
    expiresAt: {
      type: Date,
      default: null
    },
    features: {
      unlimitedSwipes: { type: Boolean, default: false },
      seeWhoLikesYou: { type: Boolean, default: false },
      unlimitedRewinds: { type: Boolean, default: false },
      boostPerMonth: { type: Number, default: 0 },
      superLikesPerDay: { type: Number, default: 0 },
      noAds: { type: Boolean, default: false },
      advancedFilters: { type: Boolean, default: false },
      readReceipts: { type: Boolean, default: false },
      priorityMatches: { type: Boolean, default: false },
      incognitoMode: { type: Boolean, default: false },
      voiceNoteLimit: { type: Number, default: 30 }, 
      unsendLimit: { type: Number, default: 15 } 
    },
    source: { type: String, enum: ['ios', 'android', 'web', 'admin', null], default: null },
    productId: { type: String, default: null },
    receipt: { type: String, default: null },
    originalTransactionId: { type: String, default: null, index: true },
    purchaseToken: { type: String, default: null, index: true },
    environment: { type: String, enum: ['Production', 'Sandbox', null], default: null },
    activatedAt: { type: Date, default: null },
    restoredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    autoRenewing: { type: Boolean, default: null },
    lastEventType: { type: String, default: null },
    lastEventAt: { type: Date, default: null },
    adminGrantReason: { type: String, default: null },
    adminGrantExpiryWarningSentAt: { type: Date, default: null }
  },
  countryOfOrigin: {
    type: String,
    maxlength: 100,
    trim: true,
    default: ''
  },
  tribe: {
    type: String,
    maxlength: 100,
    trim: true,
    default: ''
  },
  languages: [{
    type: String,
    trim: true
  }],
  diasporaGeneration: {
    type: String,
    enum: ['1st_gen', '2nd_gen', '3rd_gen_plus', 'born_in_africa', 'not_applicable'],
    default: null
  },

  voiceBio: {
    url: { type: String, default: null },
    publicId: { type: String, default: null },
    duration: { type: Number, default: 0 }
  },

  dailyMatch: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    date: { type: String, default: null }
  },

  storyPrivacy: {
    blockedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    whoCanSee: {
      type: String,
      enum: ['everyone', 'matches', 'friends', 'custom'],
      default: 'everyone'
    }
  },
  dailySwipes: {
    count: { type: Number, default: 0 },
    lastReset: { type: Date, default: Date.now }
  },
  dailySuperLikes: {
    count: { type: Number, default: 0 },
    lastReset: { type: Date, default: Date.now }
  },
  streak: {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    lastLoginDate: { type: Date, default: null },
    freezeUsed: { type: Boolean, default: false }
  },
  secondChancePasses: [{
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    passedAt: { type: Date, default: Date.now }
  }],
  additionalLocations: [{
    name: { type: String, required: true },
    city: { type: String, default: '' },
    country: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now }
  }],
  activeLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  profileComments: [{
    _id: mongoose.Schema.Types.ObjectId,
    authorId: mongoose.Schema.Types.ObjectId,
    authorName: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  profileViews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  muteSettings: {
    mutedUsers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      mutedAt: {
        type: Date,
        default: Date.now
      },
      muteAll: { type: Boolean, default: true }, 
      muteMessages: { type: Boolean, default: false },
      muteVoiceCalls: { type: Boolean, default: false },
      muteVideoCalls: { type: Boolean, default: false }
    }],
    globalMute: {
      enabled: { type: Boolean, default: false },
      startTime: String, 
      endTime: String, 
      allowCalls: { type: Boolean, default: false } 
    },
    deviceLevelMute: {
      enabled: { type: Boolean, default: false } 
    }
  },
  notificationPreferences: {
    messagesEnabled: { type: Boolean, default: true },
    voiceCallsEnabled: { type: Boolean, default: true },
    videoCallsEnabled: { type: Boolean, default: true },
    matchesEnabled: { type: Boolean, default: true },
    likesEnabled: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    vibrationEnabled: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});


userSchema.index({ location: '2dsphere' });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ onlineStatus: 1, lastActive: -1 });
userSchema.index({ gender: 1, age: 1 });
// Compound index covering the core discovery filters so MongoDB resolves
// the query from a single index scan instead of intersecting five indexes.
userSchema.index({ banned: 1, isActive: 1, verificationStatus: 1, gender: 1, age: 1 });
userSchema.index({ 'premium.isActive': 1 });
userSchema.index({ verified: 1 });
userSchema.index({ isActive: 1, createdAt: -1 });
userSchema.index({ name: 'text', bio: 'text' });
userSchema.index({ blockedUsers: 1 });
userSchema.index({ lookingFor: 1 });
userSchema.index({ banned: 1, suspended: 1 });
userSchema.index({ 'lifestyle.religion': 1 });
userSchema.index({ 'lifestyle.smoking': 1 });
userSchema.index({ 'lifestyle.drinking': 1 });
userSchema.index({ 'lifestyle.wantsKids': 1 });
userSchema.index({ 'lifestyle.exercise': 1 });
userSchema.index({ gender: 1, age: 1, isActive: 1, banned: 1 });
// Compound index for the daily-match candidate query — covers the four hard
// filters used in /match/daily-match so MongoDB can satisfy them from the
// index without a full collection scan.
userSchema.index({ banned: 1, emailVerified: 1, gender: 1, age: 1, 'privacySettings.incognitoMode': 1 });
// Sparse index on fcmToken for efficient FCM token health queries (admin panel,
// push delivery audits). Sparse so documents without a token are excluded.
userSchema.index({ fcmToken: 1 }, { sparse: true });
userSchema.index({ verificationStatus: 1 });
userSchema.index({ discoveryStackExhaustedAt: 1 }, { sparse: true });
userSchema.index({ pushToken: 1 }, { sparse: true });


userSchema.pre('save', async function() {
  if (this.emailVerified && this.expireAt) {
    this.expireAt = undefined;
  }
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});


userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
