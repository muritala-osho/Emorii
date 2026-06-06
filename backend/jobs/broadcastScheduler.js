const logger = require('../utils/logger');
const cron = require('node-cron');
const ScheduledBroadcast = require('../models/ScheduledBroadcast');
const User = require('../models/User');

let isRunning = false;

async function fireBroadcast(broadcast) {
  let reach = 0;
  let sent = 0;

  try {
    const query = { isActive: true, isBanned: { $ne: true } };

    if (broadcast.target === 'male') query.gender = 'male';
    else if (broadcast.target === 'female') query.gender = 'female';
    else if (broadcast.target === 'verified') query.isVerified = true;
    else if (broadcast.target === 'platinum') query.subscriptionTier = 'platinum';
    else if (broadcast.target === 'gold') query.subscriptionTier = 'gold';
    else if (broadcast.target === 'lagos') query.city = /lagos/i;
    else if (broadcast.target === 'london') query.city = /london/i;

    const users = await User.find(query).select('_id pushToken').limit(50000).lean();
    reach = users.length;

    for (const user of users) {
      if (user.pushToken) {
        sent++;
      }
    }

    await ScheduledBroadcast.findByIdAndUpdate(broadcast._id, {
      status: 'fired',
      firedAt: new Date(),
      reach,
    });

    logger.log(`[BroadcastScheduler] Fired "${broadcast.title}" to ${reach} users (${sent} push tokens).`);
  } catch (err) {
    await ScheduledBroadcast.findByIdAndUpdate(broadcast._id, {
      status: 'failed',
      errorMessage: err.message,
    });
    logger.error(`[BroadcastScheduler] Failed to fire "${broadcast.title}":`, err.message);
  }
}

async function checkDueBroadcasts() {
  if (isRunning) return;
  isRunning = true;
  try {
    const now = new Date();
    const due = await ScheduledBroadcast.find({
      status: 'pending',
      scheduledAt: { $lte: now },
    }).limit(20);

    if (due.length > 0) {
      logger.log(`[BroadcastScheduler] ${due.length} broadcast(s) due — firing now.`);
      for (const broadcast of due) {
        await fireBroadcast(broadcast);
      }
    }
  } catch (err) {
    logger.error('[BroadcastScheduler] Check error:', err.message);
  } finally {
    isRunning = false;
  }
}

function startBroadcastScheduler() {
  cron.schedule('* * * * *', checkDueBroadcasts, {
    name: 'broadcast-scheduler',
    timezone: 'UTC',
  });
  logger.log('[BroadcastScheduler] Started — checking every minute.');
}

module.exports = { startBroadcastScheduler, checkDueBroadcasts };
