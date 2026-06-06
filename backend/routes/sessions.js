const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const Session = require('../models/Session');
const redis = require('../utils/redis');
const logger = require('../utils/logger');

async function lookupGeo(ipAddress) {
  if (!ipAddress || ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress.startsWith('::ffff:127')) {
    return { city: null, country: null };
  }
  const cleanIp = ipAddress.startsWith('::ffff:') ? ipAddress.slice(7) : ipAddress;
  try {
    const geoRes = await fetch(`http://ip-api.com/json/${cleanIp}?fields=city,country,status`, {
      signal: AbortSignal.timeout(3000),
    });
    const geo = await geoRes.json();
    if (geo.status === 'success') return { city: geo.city || null, country: geo.country || null };
  } catch (_) {}
  return { city: null, country: null };
}

function parseUserAgent(ua) {
  if (!ua) return { deviceName: 'Unknown Device', platform: 'unknown' };
  let platform = 'unknown';
  if (/android/i.test(ua)) platform = 'android';
  else if (/iphone|ipad|ipod/i.test(ua)) platform = 'ios';
  else if (/windows|macintosh|linux/i.test(ua)) platform = 'web';

  const modelMatch = ua.match(/\(([^)]+)\)/);
  let deviceName = 'Unknown Device';
  if (modelMatch) {
    const info = modelMatch[1].replace(/;/g, '·').trim();
    deviceName = info.length > 60 ? info.slice(0, 60) + '…' : info;
  }
  return { deviceName, platform };
}

router.get('/', protect, async (req, res) => {
  try {
    let sessions = await Session.find({ userId: req.user._id }).sort({ lastActive: -1 });
    const currentSessionId = req.sessionId;

    if (sessions.length === 0 && currentSessionId) {
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
      const cleanIp = ipAddress && ipAddress.startsWith('::ffff:') ? ipAddress.slice(7) : ipAddress;

      const deviceName = req.headers['x-device-name'] || parseUserAgent(req.headers['user-agent']).deviceName;
      const platform   = req.headers['x-platform']     || parseUserAgent(req.headers['user-agent']).platform;
      const { city, country } = await lookupGeo(cleanIp);

      try {
        await Session.create({
          userId: req.user._id,
          sessionId: currentSessionId,
          deviceName,
          platform,
          ipAddress: cleanIp,
          city,
          country,
        });
        logger.info(`[Sessions] Auto-registered missing session for user ${req.user._id}`);
      } catch (createErr) {
        if (createErr.code !== 11000) {
          logger.warn('[Sessions] Could not auto-create session:', createErr.message);
        }
      }

      sessions = await Session.find({ userId: req.user._id }).sort({ lastActive: -1 });
    }

    // Self-heal stale device info and missing location for the current session
    const currentSession = sessions.find(s => s.sessionId === currentSessionId);
    if (currentSession) {
      const freshName = req.headers['x-device-name'] || null;
      const freshPlatform = req.headers['x-platform'] || null;
      const needsDeviceHeal = (currentSession.deviceName === 'Unknown Device' || currentSession.platform === 'unknown') && (freshName || freshPlatform);
      const needsLocationHeal = !currentSession.city && !currentSession.country;

      const updateFields = { lastActive: new Date() };
      if (needsDeviceHeal) {
        if (freshName) updateFields.deviceName = freshName;
        if (freshPlatform) updateFields.platform = freshPlatform;
      }

      if (needsLocationHeal) {
        const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;
        const cleanIp = rawIp && rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;
        const { city, country } = await lookupGeo(cleanIp);
        if (city || country) {
          updateFields.city = city;
          updateFields.country = country;
          if (cleanIp) updateFields.ipAddress = cleanIp;
        }
      }

      if (needsDeviceHeal || needsLocationHeal) {
        await Session.updateOne({ sessionId: currentSessionId }, { $set: updateFields });
        sessions = await Session.find({ userId: req.user._id }).sort({ lastActive: -1 });
      }
    }

    const sessionData = sessions.map((s) => ({
      _id: s._id,
      sessionId: s.sessionId,
      deviceName: s.deviceName,
      platform: s.platform,
      ipAddress: s.ipAddress,
      city: s.city,
      country: s.country,
      lastActive: s.lastActive,
      createdAt: s.createdAt,
      isCurrent: s.sessionId === currentSessionId,
    }));

    res.json({ success: true, sessions: sessionData });
  } catch (error) {
    logger.error('[Sessions] GET / error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to load sessions' });
  }
});

router.delete('/others', protect, async (req, res) => {
  try {
    const currentSessionId = req.sessionId;
    const userId = req.user._id.toString();

    const otherSessions = await Session.find({
      userId: req.user._id,
      sessionId: { $ne: currentSessionId },
    });

    if (otherSessions.length === 0) {
      return res.json({ success: true, message: 'No other active sessions' });
    }

    await Promise.all(
      otherSessions.map((s) =>
        redis.set(`revoked:${s.sessionId}`, '1', 7 * 24 * 60 * 60)
      )
    );

    await Session.deleteMany({
      userId: req.user._id,
      sessionId: { $ne: currentSessionId },
    });

    // Force-logout all other devices via socket immediately
    const io = req.app.get('io');
    if (io) {
      io.to(userId).emit('session:revoked', {
        reason: 'You were logged out from another device.',
      });
    }

    res.json({
      success: true,
      message: `${otherSessions.length} other device(s) logged out`,
      count: otherSessions.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to log out other devices' });
  }
});

router.delete('/:sessionId', protect, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id.toString();

    if (sessionId === req.sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Use the logout button to end your current session',
      });
    }

    const session = await Session.findOne({ sessionId, userId: req.user._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    await redis.set(`revoked:${sessionId}`, '1', 7 * 24 * 60 * 60);
    await Session.deleteOne({ sessionId });

    // Force-logout the removed device via socket immediately
    const io = req.app.get('io');
    if (io) {
      io.to(userId).emit('session:revoked', {
        reason: 'This device was removed from your account.',
      });
    }

    res.json({ success: true, message: 'Device logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to log out device' });
  }
});

module.exports = router;
