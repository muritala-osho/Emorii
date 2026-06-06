const logger = require('./logger');
const apn = require('@parse/node-apn');

let _provider = null;

function getProvider() {
  if (_provider) return _provider;

  const keyId    = process.env.APNS_KEY_ID;
  const teamId   = process.env.APNS_TEAM_ID;
  const keyValue = process.env.APNS_KEY;

  if (!keyId || !teamId || !keyValue) {
    return null;
  }

  _provider = new apn.Provider({
    token: {
      key:    keyValue,
      keyId,
      teamId,
    },
    production: process.env.NODE_ENV === 'production',
  });

  return _provider;
}

async function sendVoipPush(voipToken, { callerId, callerName, callerPhoto, callType, callData } = {}) {
  if (!voipToken) {
    logger.warn('[VoIP Push] No VoIP token provided — skipping.');
    return;
  }

  const provider = getProvider();
  if (!provider) {
    logger.warn('[VoIP Push] APNs credentials not configured — skipping.');
    return;
  }

  const bundleId = process.env.APNS_BUNDLE_ID;
  const voipTopic = `${bundleId}.voip`;

  const notification = new apn.Notification();
  notification.topic       = voipTopic;
  notification.priority    = 10;
  notification.pushType    = 'voip';
  notification.expiry      = Math.floor(Date.now() / 1000) + 30;
  notification.payload     = { callerId, callerName, callerPhoto, callType, callData };

  try {
    const result = await provider.send(notification, voipToken);
    if (result.failed?.length) {
      logger.error('[VoIP Push] Failed to deliver to some devices:', result.failed);
    } else {
      logger.log(`[VoIP Push] Sent to ${voipToken.slice(0, 20)}…`);
    }
    return result;
  } catch (err) {
    logger.error('[VoIP Push] Error sending push:', err);
  }
}

function shutdown() {
  if (_provider) {
    _provider.shutdown();
    _provider = null;
  }
}

module.exports = { sendVoipPush, shutdown };
