const logger = require('./logger');
/**
 * Emorii Churn Prediction Engine
 *
 * Produces a 0–1 churn risk score for each user based on behavioural signals,
 * then selects the appropriate intervention tier and executes it.
 *
 * Score bands:
 *   0.00 – 0.50  → No action needed
 *   0.50 – 0.65  → Tier 1: Subtle push  ("You have new likes waiting 💚")
 *   0.65 – 0.80  → Tier 2: Push + Email  ("We miss you" re-engagement)
 *   0.80 – 1.00  → Tier 3: Free 24-h Boost grant + Push + Email
 */

const User  = require('../models/User');
const Match = require('../models/Match');
const { sendSmartNotification } = require('./pushNotifications');
const { sendInactivityEmail }   = require('./emailService');


const WEIGHTS = {
  daysSinceLastActive:          0.30,  // strongest signal
  noMessagedMatches:            0.20,  // silent matches = disengagement
  lowMatchRate:                 0.15,  // swiping but not matching → frustration
  swipeVolumeDecline:           0.15,  // fewer swipes this week vs last week
  daysSinceLastMessage:         0.10,  // conversation inactivity
  lowNotificationEngagement:    0.10,  // ignoring all pushes
};

const MIN_HOURS_BETWEEN_INTERVENTIONS = 72;

/**
 * Produces a 0–1 churn risk score for a single user doc (must have
 * swipedRight, premium, lastActive, notificationEngagement populated).
 */
const computeChurnScore = (user, matchCount, silentMatchCount, recentSwipes, olderSwipes, daysSinceLastMsg) => {
  const now = Date.now();

  const daysSinceActive = Math.min(
    (now - new Date(user.lastActive).getTime()) / (1000 * 60 * 60 * 24),
    30
  );
  const activeScore = daysSinceActive / 30; // 0 = very active, 1 = gone 30+ days

  const silentMatchRatio = matchCount > 0 ? Math.min(silentMatchCount / matchCount, 1) : 0;

  const totalSwipes = (user.swipedRight?.length || 0) + (user.swipedLeft?.length || 0);
  const matchRate   = totalSwipes > 0 ? Math.min(matchCount / totalSwipes, 1) : 0;
  const lowMatchRateScore = totalSwipes < 5 ? 0 : Math.max(0, 1 - matchRate * 5);

  let swipeDeclineScore = 0;
  if (olderSwipes > 0) {
    swipeDeclineScore = Math.max(0, Math.min(1, 1 - recentSwipes / olderSwipes));
  } else if (recentSwipes === 0) {
    swipeDeclineScore = 0.5; // no swipes ever → moderate signal
  }

  const msgInactiveScore = daysSinceLastMsg !== null
    ? Math.min(daysSinceLastMsg / 14, 1)
    : 0.3; // never messaged anyone → slight signal

  const engagement = user.notificationEngagement || [];
  const totalSent   = engagement.reduce((s, e) => s + (e.sent || 0), 0);
  const totalOpened = engagement.reduce((s, e) => s + (e.opened || 0), 0);
  const openRate    = totalSent > 0 ? totalOpened / totalSent : null;
  const notifScore  = openRate !== null ? Math.max(0, 1 - openRate * 2) : 0.2;

  const rawScore =
    WEIGHTS.daysSinceLastActive       * activeScore +
    WEIGHTS.noMessagedMatches         * silentMatchRatio +
    WEIGHTS.lowMatchRate              * lowMatchRateScore +
    WEIGHTS.swipeVolumeDecline        * swipeDeclineScore +
    WEIGHTS.daysSinceLastMessage      * msgInactiveScore +
    WEIGHTS.lowNotificationEngagement * notifScore;

  const premiumDampening = user.premium?.isActive ? 0.6 : 1.0;

  const accountAgedays = (now - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  const newUserDampening = accountAgedays < 7 ? 0.4 : 1.0;

  return Math.min(1, rawScore * premiumDampening * newUserDampening);
};

const TIER_1_MESSAGES = [
  { title: '💚 You have new likes waiting!',      body: 'Someone on Emorii likes you. Open the app to find out who.' },
  { title: '🔥 Your profile is getting attention', body: 'People have been viewing your profile. Come see who\'s interested!' },
  { title: '💌 Don\'t miss your matches',          body: 'You have unread matches waiting for you on Emorii.' },
];

const TIER_2_MESSAGES = [
  { title: '👋 We miss you, come back!',           body: 'New people have joined in your area. Your perfect match could be waiting.' },
  { title: '🌍 Your tribe is growing',             body: 'Dozens of new members joined Emorii this week near you.' },
];

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const executeIntervention = async (user, score) => {
  if (score >= 0.80) {
    await sendSmartNotification(user, {
      title: '🚀 We\'ve given you a free Boost!',
      body: 'Your profile is now boosted for 24 hours — enjoy the extra visibility!',
      data: { screen: 'Discovery', boostGranted: true },
      channelId: 'engagement',
    }, 'system');
    await sendInactivityEmail(user.email, user.name);

    user.churnInterventionTier = 'boost';
    user.freeBoostGrantedAt = new Date();

  } else if (score >= 0.65) {
    const msg = pickRandom(TIER_2_MESSAGES);
    await sendSmartNotification(user, {
      title: msg.title,
      body: msg.body,
      data: { screen: 'Discovery' },
      channelId: 'engagement',
    }, 'system');
    if (user.settings?.emailNotifications !== false) {
      await sendInactivityEmail(user.email, user.name);
    }
    user.churnInterventionTier = 'email';

  } else {
    const msg = pickRandom(TIER_1_MESSAGES);
    await sendSmartNotification(user, {
      title: msg.title,
      body: msg.body,
      data: { screen: 'Discovery' },
      channelId: 'engagement',
    }, 'system');
    user.churnInterventionTier = 'push';
  }

  user.churnScore              = score;
  user.churnInterventionSentAt = new Date();
  await user.save();
};

const runChurnPrediction = async () => {
  logger.log('[ChurnEngine] Starting churn prediction run...');
  const now = Date.now();
  let processed = 0, intervened = 0;

  try {
    const users = await User.find({
      emailVerified: true,
      banned: false,
      suspended: false,
      createdAt: { $lt: new Date(now - 3 * 24 * 60 * 60 * 1000) }, // account > 3 days old
    })
      .select('name email pushToken pushNotificationsEnabled notificationPreferences muteSettings lastActive createdAt swipedRight swipedLeft premium settings notificationEngagement churnInterventionSentAt churnInterventionTier freeBoostGrantedAt')
      .lean(false)
      .limit(500); // process in batches

    for (const user of users) {
      try {
        processed++;

        if (user.churnInterventionSentAt) {
          const hoursSince = (now - new Date(user.churnInterventionSentAt).getTime()) / (1000 * 60 * 60);
          if (hoursSince < MIN_HOURS_BETWEEN_INTERVENTIONS) continue;
        }

        const [matches, silentMatches, allMessages] = await Promise.all([
          Match.find({ users: user._id, status: 'active' }).select('lastMessageAt').lean(),
          Match.find({ users: user._id, status: 'active', lastMessageAt: null }).countDocuments(),
          Promise.resolve(null),
        ]);

        const matchCount       = matches.length;
        const silentMatchCount = silentMatches;

        const lastMsgDates = matches
          .filter(m => m.lastMessageAt)
          .map(m => new Date(m.lastMessageAt).getTime());
        const daysSinceLastMsg = lastMsgDates.length > 0
          ? (now - Math.max(...lastMsgDates)) / (1000 * 60 * 60 * 24)
          : null;

        const recentSwipes = user.lastActive && (now - new Date(user.lastActive).getTime()) < 7 * 24 * 60 * 60 * 1000
          ? user.swipedRight?.length || 0 : 0;
        const olderSwipes = user.swipedRight?.length || 0;

        const score = computeChurnScore(
          user,
          matchCount,
          silentMatchCount,
          recentSwipes,
          olderSwipes,
          daysSinceLastMsg
        );

        user.churnScore = score;

        if (score >= 0.50) {
          await executeIntervention(user, score);
          intervened++;
        } else {
          await user.save();
        }

      } catch (userErr) {
        logger.error(`[ChurnEngine] Error processing user ${user._id}:`, userErr.message);
      }
    }

    logger.log(`[ChurnEngine] Run complete. Processed: ${processed}, Intervened: ${intervened}`);
  } catch (err) {
    logger.error('[ChurnEngine] Fatal error:', err.message);
  }
};

module.exports = { runChurnPrediction, computeChurnScore };
