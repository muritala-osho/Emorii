const logger = require('./logger');

/**
 * Expo Push Receipt Poller
 *
 * WHY THIS EXISTS
 * ────────────────
 * Expo's push pipeline is two-stage:
 *
 *   Stage 1 — Ticket (immediate, ~100 ms):
 *     expo.sendPushNotificationsAsync() returns a ticket per message.
 *     A ticket with status "ok" means Expo accepted the message — NOT that
 *     the device received it. The ticket carries an `id` (the receipt ID).
 *
 *   Stage 2 — Receipt (delayed, ~15–30 min):
 *     expo.getPushNotificationReceiptsAsync(receiptIds) returns the final
 *     delivery status: "ok" (device received it) or "error" (delivery failed).
 *     The most critical error is DeviceNotRegistered — the token is stale and
 *     must be deleted so future sends don't keep failing silently.
 *
 * The in-process setTimeout in pushNotifications.js already polls receipts
 * 20 minutes after each send, but the map holding receipt-ID → push-token is
 * in-memory only. If the server restarts within those 20 minutes the callback
 * is lost and those receipts are never checked.
 *
 * This module provides a DB-backed sweep that runs on a schedule. It queries
 * NotificationLog for push entries with status "sent" and a non-null providerId
 * (= the Expo receipt ID) that are 20–24 hours old, checks the Expo receipt
 * API, and updates each log row to "delivered" or "failed". Any
 * DeviceNotRegistered failure also clears the user's pushToken from the DB.
 *
 * COVERAGE
 * ─────────
 *   • Restarts within 20 min — covered by DB sweep on next scheduled run
 *   • Stale tokens — cleared automatically, no manual intervention needed
 *   • Delivery visibility — admin dashboard shows accurate delivered/failed counts
 *
 * FREQUENCY
 * ──────────
 * Called every 30 minutes from scheduledJobs.js. Expo keeps receipts for up
 * to 24 hours, so a 30-minute sweep interval gives 48 chances to catch each
 * receipt before it expires.
 */

const TWENTY_MIN_MS     = 20 * 60 * 1000;
const TWENTY_FOUR_HR_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE        = 100; // Expo receipt API max per call

async function runReceiptSweep() {
  try {
    const NotificationLog = require('../models/NotificationLog');
    const User            = require('../models/User');
    const { expo }        = require('./pushNotifications');

    const now             = new Date();
    const oldestAllowed   = new Date(now.getTime() - TWENTY_FOUR_HR_MS);
    const newestAllowed   = new Date(now.getTime() - TWENTY_MIN_MS);

    const pending = await NotificationLog.find({
      channel:    'push',
      status:     'sent',
      providerId: { $ne: null },
      createdAt:  { $gte: oldestAllowed, $lte: newestAllowed },
    })
      .select('_id providerId recipient')
      .limit(BATCH_SIZE)
      .lean();

    if (pending.length === 0) return;

    logger.log(`[ReceiptPoller] Checking ${pending.length} pending push receipt(s)…`);

    const receiptIdToLog = new Map();
    for (const entry of pending) {
      if (entry.providerId) {
        receiptIdToLog.set(entry.providerId, entry);
      }
    }

    const receiptIds = [...receiptIdToLog.keys()];

    let receipts;
    try {
      const chunks = expo.chunkPushNotificationReceiptIds(receiptIds);
      receipts = {};
      for (const chunk of chunks) {
        const result = await expo.getPushNotificationReceiptsAsync(chunk);
        Object.assign(receipts, result);
      }
    } catch (fetchErr) {
      logger.error('[ReceiptPoller] Expo receipt fetch failed:', fetchErr?.message || fetchErr);
      return;
    }

    let delivered = 0;
    let failed = 0;
    const bulkOps = [];

    for (const [receiptId, receipt] of Object.entries(receipts)) {
      const logEntry = receiptIdToLog.get(receiptId);
      if (!logEntry) continue;

      if (receipt.status === 'ok') {
        bulkOps.push({
          updateOne: {
            filter: { _id: logEntry._id },
            update: { $set: { status: 'delivered' } },
          },
        });
        delivered++;
      } else if (receipt.status === 'error') {
        const errMsg = receipt.message || (receipt.details && receipt.details.error) || 'unknown';
        bulkOps.push({
          updateOne: {
            filter: { _id: logEntry._id },
            update: { $set: { status: 'failed', errorMessage: errMsg } },
          },
        });
        failed++;
        logger.warn(`[ReceiptPoller] Receipt error for ${receiptId}: ${errMsg}`);

        if (receipt.details?.error === 'DeviceNotRegistered') {
          if (logEntry.recipient) {
            try {
              await User.updateOne(
                { _id: logEntry.recipient },
                { $unset: { pushToken: '' } },
              );
              logger.warn(`[ReceiptPoller] Cleared stale push token for user ${logEntry.recipient}`);
            } catch (dbErr) {
              logger.error('[ReceiptPoller] Failed to clear stale token:', dbErr?.message || dbErr);
            }
          }
        }
      }
    }

    if (bulkOps.length > 0) {
      await NotificationLog.bulkWrite(bulkOps, { ordered: false });
    }

    logger.log(
      `[ReceiptPoller] Sweep complete — delivered: ${delivered}, failed: ${failed},`,
      `unchecked: ${pending.length - delivered - failed}`,
    );
  } catch (err) {
    logger.error('[ReceiptPoller] Unexpected error during receipt sweep:', err?.message || err);
  }
}

module.exports = { runReceiptSweep };
