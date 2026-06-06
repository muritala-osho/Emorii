const logger = require('./logger');
const User = require('../models/User');
const {
  sendRenewalReminderEmail,
  sendInactivityEmail,
  sendAdminGrantExpiryWarningEmail,
} = require('./emailService');
const { runChurnPrediction } = require('./churnEngine');
const { sendSmartNotification } = require('./pushNotifications');
const { runReceiptSweep } = require('./receiptPoller');

const THIRTY_DAYS_MS       = 30 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS        =  3 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS        =  7 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL       = 60 * 60 * 1000; // run every hour
const BUSY_WATCHDOG_MS     =  2 * 60 * 1000; // run every 2 minutes

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

const runRenewalReminders = async () => {
  try {
    const now = new Date();

    const users = await User.find({
      'premium.isActive': true,
      'premium.plan': { $ne: 'free' },
      'premium.expiresAt': {
        $gte: now,
        $lte: new Date(now.getTime() + SEVEN_DAYS_MS),
      },
    }).select('email name premium renewalReminderSentAt');

    for (const user of users) {
      try {
        const msUntilExpiry = new Date(user.premium.expiresAt).getTime() - now.getTime();
        const daysLeft = Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000));

        const lastSent = user.renewalReminderSentAt
          ? new Date(user.renewalReminderSentAt).getTime()
          : 0;
        if (now.getTime() - lastSent < 24 * 60 * 60 * 1000) continue;

        const planLabel = user.premium.plan.charAt(0).toUpperCase() + user.premium.plan.slice(1);
        await sendRenewalReminderEmail(
          user.email,
          user.name,
          planLabel,
          formatDate(user.premium.expiresAt),
          daysLeft
        );

        user.renewalReminderSentAt = now;
        await user.save();
      } catch (err) {
        logger.error(`Renewal reminder failed for user ID ${user._id}:`, err.message);
      }
    }

    if (users.length > 0) {
      logger.log(`[ScheduledJobs] Renewal reminders processed for ${users.length} user(s).`);
    }
  } catch (err) {
    logger.error('[ScheduledJobs] Renewal reminder job error:', err.message);
  }
};

const runInactivityEmails = async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

    const users = await User.find({
      emailVerified: true,
      banned: false,
      suspended: false,
      lastActive: { $lt: thirtyDaysAgo },
      inactivityEmailSentAt: { $exists: false },
    }).select('email name lastActive inactivityEmailSentAt').limit(100);

    for (const user of users) {
      try {
        await sendInactivityEmail(user.email, user.name);
        user.inactivityEmailSentAt = new Date();
        await user.save();
      } catch (err) {
        logger.error(`Inactivity email failed for user ID ${user._id}:`, err.message);
      }
    }

    if (users.length > 0) {
      logger.log(`[ScheduledJobs] Inactivity emails sent to ${users.length} user(s).`);
    }
  } catch (err) {
    logger.error('[ScheduledJobs] Inactivity email job error:', err.message);
  }
};

const runPremiumExpiry = async () => {
  try {
    const result = await User.updateMany(
      {
        'premium.isActive': true,
        'premium.expiresAt': { $lt: new Date() },
      },
      { $set: { 'premium.isActive': false } }
    );
    if (result.modifiedCount > 0) {
      logger.log(`[ScheduledJobs] Expired premium for ${result.modifiedCount} user(s).`);
    }
  } catch (err) {
    logger.error('[ScheduledJobs] Premium expiry sweep error:', err.message);
  }
};

const runAdminGrantExpiryWarnings = async () => {
  try {
    const now = new Date();
    const sevenDays = new Date(now.getTime() + SEVEN_DAYS_MS);

    const grantees = await User.find({
      'premium.isActive': true,
      'premium.source': 'admin',
      'premium.expiresAt': { $gte: now, $lte: sevenDays },
      $or: [
        { 'premium.adminGrantExpiryWarningSentAt': null },
        { 'premium.adminGrantExpiryWarningSentAt': { $exists: false } },
      ],
    }).select('email name premium').lean();

    if (grantees.length === 0) return;

    const admins = await User.find({ isAdmin: true })
      .select('email name')
      .lean();

    if (admins.length === 0) {
      logger.log('[ScheduledJobs] Admin-grant expiry warning skipped — no admins configured.');
      return;
    }

    let notified = 0;
    for (const grantee of grantees) {
      const msUntilExpiry = new Date(grantee.premium.expiresAt).getTime() - now.getTime();
      const daysLeft = Math.max(1, Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000)));

      let anySent = false;
      for (const admin of admins) {
        if (!admin.email) continue;
        const result = await sendAdminGrantExpiryWarningEmail({
          adminEmail: admin.email,
          adminName: admin.name,
          granteeName: grantee.name,
          granteeEmail: grantee.email,
          expiresAt: grantee.premium.expiresAt,
          daysLeft,
          reason: grantee.premium.adminGrantReason,
        });
        if (result?.success) anySent = true;
      }

      if (anySent) {
        await User.updateOne(
          { _id: grantee._id },
          { $set: { 'premium.adminGrantExpiryWarningSentAt': now } }
        );
        notified += 1;
      }
    }

    if (notified > 0) {
      logger.log(`[ScheduledJobs] Admin grant expiry warnings sent for ${notified}/${grantees.length} grant(s) to ${admins.length} admin(s).`);
    }
  } catch (err) {
    logger.error('[ScheduledJobs] Admin grant expiry warning job error:', err.message);
  }
};

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

const runDiscoveryWaitingNotifications = async () => {
  try {
    const now = new Date();
    const minExhaustedBefore = new Date(now.getTime() - FOUR_HOURS_MS);
    const minActiveAfter = new Date(now.getTime() - FOURTEEN_DAYS_MS);
    const notifyCutoff = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS);

    const candidates = await User.find({
      discoveryStackExhaustedAt: { $ne: null, $lte: minExhaustedBefore },
      lastActive: { $gte: minActiveAfter },
      banned: { $ne: true },
      suspended: { $ne: true },
      pushToken: { $ne: null },
      pushNotificationsEnabled: { $ne: false },
      $or: [
        { lastDiscoveryWaitingNotifiedAt: null },
        { lastDiscoveryWaitingNotifiedAt: { $lte: notifyCutoff } },
      ],
    })
      .select('_id name gender preferences pushToken pushNotificationsEnabled muteSettings notificationPreferences discoveryStackExhaustedAt')
      .limit(200);

    if (candidates.length === 0) return;

    let sent = 0;
    for (const u of candidates) {
      try {
        const prefGender = u.preferences?.genderPreference;
        const wantedGenders = [];
        if (prefGender && prefGender !== 'any' && prefGender !== 'both') {
          wantedGenders.push(prefGender);
        } else if (u.gender === 'male') {
          wantedGenders.push('female');
        } else if (u.gender === 'female') {
          wantedGenders.push('male');
        }

        const newUsersQuery = {
          _id: { $ne: u._id },
          createdAt: { $gte: u.discoveryStackExhaustedAt },
          banned: { $ne: true },
          suspended: { $ne: true },
        };
        if (wantedGenders.length > 0) {
          newUsersQuery.gender = { $in: wantedGenders };
        }

        const freshCount = await User.countDocuments(newUsersQuery).limit(10);
        if (freshCount === 0) continue;

        const sentOk = await sendSmartNotification(
          u,
          {
            title: 'New people are waiting for you 💫',
            body: 'Open Emorii — your discovery just got fresh!',
            data: { type: 'discovery_waiting', screen: 'Discovery' },
          },
          'system',
        );

        if (sentOk) {
          await User.updateOne(
            { _id: u._id },
            {
              $set: { lastDiscoveryWaitingNotifiedAt: now },
              $unset: { discoveryStackExhaustedAt: '' },
            }
          );
          sent += 1;
        }
      } catch (err) {
        logger.error(`[ScheduledJobs] Discovery waiting notify failed for user ${u._id}:`, err.message);
      }
    }

    if (sent > 0) {
      logger.log(`[ScheduledJobs] Discovery waiting notifications sent to ${sent}/${candidates.length} user(s).`);
    }
  } catch (err) {
    logger.error('[ScheduledJobs] Discovery waiting job error:', err.message);
  }
};

/**
 * Busy-state watchdog.
 * Clears stale `busy:*` Redis keys for users with no active socket, as a
 * safety net for mid-call disconnects (airplane mode, crash, hard-kill).
 *
 * @param {Map<string, string>} onlineUsers  Map of userId → socketId.
 * @param {import('redis').RedisClientType} redisClient  Shared Redis client.
 */
const startBusyWatchdog = (onlineUsers, redisClient) => {
  if (!redisClient) {
    logger.log('[BusyWatchdog] Redis not available — watchdog disabled.');
    return;
  }

  const runWatchdog = async () => {
    try {
      const keys = await redisClient.keys('busy:*');
      if (!keys || keys.length === 0) return;

      let cleared = 0;
      for (const key of keys) {
        const userId = key.slice(5); // strip 'busy:' prefix
        if (!onlineUsers.has(userId)) {
          await redisClient.del(key);
          cleared++;
          logger.log(`[BusyWatchdog] Cleared stale busy flag for offline user: ${userId}`);
        }
      }

      if (cleared > 0) {
        logger.log(`[BusyWatchdog] Swept ${keys.length} key(s) — cleared ${cleared} stale flag(s).`);
      }
    } catch (err) {
      logger.error('[BusyWatchdog] Error during sweep:', err?.message || err);
    }
  };

  setInterval(runWatchdog, BUSY_WATCHDOG_MS);
  logger.log('[BusyWatchdog] Started — sweeping every 2 minutes.');
};

const runTokenValidationSweep = async () => {
  try {
    const { expo } = require('./pushNotifications');
    const { Expo } = require('expo-server-sdk');
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const BATCH = 200;

    const staleUsers = await User.find({
      pushToken: { $ne: null },
      $or: [
        { pushTokenUpdatedAt: { $lt: thirtyDaysAgo } },
        { pushTokenUpdatedAt: null },
      ],
      banned: { $ne: true },
      suspended: { $ne: true },
    })
      .select('_id pushToken pushTokenUpdatedAt')
      .limit(BATCH)
      .lean();

    if (staleUsers.length === 0) return;

    logger.log(`[TokenSweep] Validating ${staleUsers.length} push token(s) not confirmed in 30+ days…`);

    const validUsers = staleUsers.filter(u => Expo.isExpoPushToken(u.pushToken));
    if (validUsers.length === 0) {
      const ids = staleUsers.map(u => u._id);
      await User.updateMany({ _id: { $in: ids } }, { $unset: { pushToken: '', pushTokenUpdatedAt: '' } });
      logger.warn(`[TokenSweep] Cleared ${staleUsers.length} malformed token(s).`);
      return;
    }

    const messages = validUsers.map(u => ({
      to: u.pushToken,
      data: { type: 'ping' },
      priority: 'normal',
      ttl: 60,
    }));

    const chunks = expo.chunkPushNotifications(messages);
    const ticketIdToUser = new Map();
    let invalidImmediate = 0;

    for (const chunk of chunks) {
      let ticketChunk;
      try {
        ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        logger.error('[TokenSweep] Chunk send error:', err?.message);
        continue;
      }

      ticketChunk.forEach((ticket, i) => {
        const user = chunk[i] && validUsers.find(u => u.pushToken === chunk[i].to);
        if (!user) return;
        if (ticket.status === 'error') {
          invalidImmediate++;
          if (ticket.details?.error === 'DeviceNotRegistered') {
            User.updateOne({ _id: user._id }, { $unset: { pushToken: '', pushTokenUpdatedAt: '' } })
              .catch(() => {});
            logger.warn(`[TokenSweep] Immediate DeviceNotRegistered — cleared token for user ${user._id}`);
          }
        } else if (ticket.id) {
          ticketIdToUser.set(ticket.id, user);
        }
      });
    }

    if (ticketIdToUser.size > 0) {
      setTimeout(async () => {
        try {
          const receiptIds = [...ticketIdToUser.keys()];
          const chunks2 = expo.chunkPushNotificationReceiptIds(receiptIds);
          let cleared = 0;
          let validated = 0;

          for (const chunk of chunks2) {
            let receipts;
            try {
              receipts = await expo.getPushNotificationReceiptsAsync(chunk);
            } catch (err) {
              logger.error('[TokenSweep] Receipt fetch error:', err?.message);
              continue;
            }

            for (const [receiptId, receipt] of Object.entries(receipts)) {
              const user = ticketIdToUser.get(receiptId);
              if (!user) continue;

              if (receipt.status === 'error') {
                cleared++;
                if (receipt.details?.error === 'DeviceNotRegistered') {
                  await User.updateOne(
                    { _id: user._id },
                    { $unset: { pushToken: '', pushTokenUpdatedAt: '' } }
                  ).catch(() => {});
                  logger.warn(`[TokenSweep] Cleared stale token for user ${user._id} (DeviceNotRegistered)`);
                } else {
                  logger.warn(`[TokenSweep] Token error for user ${user._id}: ${receipt.message}`);
                }
              } else if (receipt.status === 'ok') {
                validated++;
                await User.updateOne(
                  { _id: user._id },
                  { $set: { pushTokenUpdatedAt: new Date() } }
                ).catch(() => {});
              }
            }
          }

          logger.log(`[TokenSweep] Receipt sweep done — validated: ${validated}, cleared: ${cleared}, immediate-clears: ${invalidImmediate}`);
        } catch (err) {
          logger.error('[TokenSweep] Receipt sweep error:', err?.message);
        }
      }, 2 * 60 * 1000);
    }

    logger.log(`[TokenSweep] Pings sent to ${validUsers.length} token(s). Receipts checked in 2 min.`);
  } catch (err) {
    logger.error('[TokenSweep] Unexpected error:', err?.message || err);
  }
};

const startScheduledJobs = () => {
  logger.log('[ScheduledJobs] Starting — interval: 1 hour');

  runRenewalReminders();
  runInactivityEmails();
  runPremiumExpiry();
  runAdminGrantExpiryWarnings();

  setInterval(runRenewalReminders, CHECK_INTERVAL);
  setInterval(runInactivityEmails, CHECK_INTERVAL);
  setInterval(runPremiumExpiry, CHECK_INTERVAL);
  setInterval(runAdminGrantExpiryWarnings, CHECK_INTERVAL);

  setTimeout(() => {
    runDiscoveryWaitingNotifications();
    setInterval(runDiscoveryWaitingNotifications, TWO_HOURS_MS);
  }, 5 * 60 * 1000);

  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setTimeout(() => {
    runChurnPrediction();
    setInterval(runChurnPrediction, SIX_HOURS);
  }, 2 * 60 * 1000);

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  setTimeout(() => {
    runTokenValidationSweep();
    setInterval(runTokenValidationSweep, SEVEN_DAYS_MS);
  }, 10 * 60 * 1000);

  const THIRTY_MIN_MS = 30 * 60 * 1000;
  setTimeout(() => {
    runReceiptSweep();
    setInterval(runReceiptSweep, THIRTY_MIN_MS);
  }, 25 * 60 * 1000);
};

module.exports = { startScheduledJobs, startBusyWatchdog };
