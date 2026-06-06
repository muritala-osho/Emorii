const logger = require('../utils/logger');
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { callTokenLimiter } = require('../middleware/rateLimiter');

const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

logger.log('Agora Routes Loaded. ID:', !!AGORA_APP_ID, 'Cert:', !!AGORA_APP_CERTIFICATE);

router.get('/token', protect, callTokenLimiter, async (req, res) => {
  try {
    const { channelName, uid = 0, role = 'publisher' } = req.query;
    
    if (!channelName) {
      return res.status(400).json({ success: false, message: 'Channel name is required' });
    }
    
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      return res.status(500).json({ success: false, message: 'Agora credentials not configured' });
    }

    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const isPremium = req.user.premium?.isActive;
    // Server-side enforcement: free users get a token that expires in 5 minutes
    // (plus a small grace buffer for connection setup), so the call cannot
    // continue past the limit even with a tampered client.
    const FREE_CALL_SECONDS = 300;
    const FREE_GRACE_SECONDS = 15;
    const expirationTimeInSeconds = isPremium
      ? 3600
      : FREE_CALL_SECONDS + FREE_GRACE_SECONDS;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTimestamp + expirationTimeInSeconds;
    
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      parseInt(uid) || 0,
      rtcRole,
      privilegeExpireTime
    );

    res.json({
      success: true,
      token,
      appId: AGORA_APP_ID,
      channel: channelName,
      uid: parseInt(uid) || 0,
      isLimited: !isPremium, // Flag for frontend UX (countdown, warning)
      maxDuration: isPremium ? 0 : FREE_CALL_SECONDS,
      tokenExpiresAt: privilegeExpireTime
    });
  } catch (error) {
    logger.error('Agora token error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate token' });
  }
});

router.post('/call/initiate', protect, callTokenLimiter, async (req, res) => {
  try {
    const { targetUserId, callType } = req.body;
    
    if (!targetUserId || !callType) {
      return res.status(400).json({ success: false, message: 'Target user and call type required' });
    }
    
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      return res.status(500).json({ success: false, message: 'Agora credentials not configured' });
    }
    
    const channelName = `c${String(req.user._id).slice(-8)}${String(targetUserId).slice(-8)}${Date.now().toString(36)}`;
    // IMPORTANT: build the token with uid=0 (Agora's "wildcard" UID).
    // A token issued for uid=0 can be used by ANY client that joins with
    // uid=0, and the Agora server will then assign each joiner its own
    // unique server-side UID. Previously we issued a token bound to a
    // random UID and shipped both sides the same callData; if the
    // receiver's secondary `/agora/token` fetch ever failed, both sides
    // fell back to joining with the same UID, the server kicked one out,
    // and both ends went silent. uid=0 makes that race impossible.
    const uid = 0;

    const isPremium = req.user.premium?.isActive;
    const FREE_CALL_SECONDS = 300;
    const FREE_GRACE_SECONDS = 15;
    const expirationTimeInSeconds = isPremium
      ? 3600
      : FREE_CALL_SECONDS + FREE_GRACE_SECONDS;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTimestamp + expirationTimeInSeconds;
    
    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpireTime
    );

    res.json({
      success: true,
      callData: {
        channelName,
        token,
        appId: AGORA_APP_ID,
        uid,
        callType,
        callerId: req.user._id,
        targetUserId,
        isLimited: !isPremium,
        maxDuration: isPremium ? 0 : FREE_CALL_SECONDS,
        tokenExpiresAt: privilegeExpireTime
      }
    });
  } catch (error) {
    logger.error('Call initiation error:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate call' });
  }
});

router.get('/config', protect, (req, res) => {
  res.json({
    success: true,
    appId: AGORA_APP_ID || null,
    configured: !!(AGORA_APP_ID && AGORA_APP_CERTIFICATE),
  });
});

module.exports = router;
