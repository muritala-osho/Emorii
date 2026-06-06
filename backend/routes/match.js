const logger = require('../utils/logger');
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Match = require('../models/Match');
const Boost = require('../models/Boost');
const auth = protect;
const validate = require('../middleware/validate');
const { swipeLimiter } = require('../middleware/rateLimiter');
const schemas = require('../validators/schemas');
const redis = require('../utils/redis');
const { distanceToUser, extractLatLng, normaliseMaxDistanceKm } = require('../utils/distance');

router.get('/who-likes-me', protect, async (req, res) => {
  try {
    const FriendRequest = require('../models/FriendRequest');
    const isPremium = req.user.premium?.isActive;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const cacheKey = `wholikesme:${req.user._id}:${isPremium ? 'premium' : 'free'}:p${page}:l${limit}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ success: true, ...cached, fromCache: true });

    const pendingRequests = await FriendRequest.find({
      receiver: req.user._id,
      status: 'pending'
    }).populate('sender', 'name age bio photos location onlineStatus lastActive interests verified lifestyle gender');
    
    const usersWhoLikedMe = pendingRequests
      .filter(req => req.sender)
      .map(req => req.sender.toObject ? req.sender.toObject() : req.sender);

    let processedUsers = usersWhoLikedMe.map(u => {
      const userObj = typeof u.toObject === 'function' ? u.toObject() : u;
      let score = 0;
      
      if (req.user.lifestyle?.personalityType && userObj.lifestyle?.personalityType === req.user.lifestyle?.personalityType) {
        score += 100;
      }
      
      const sharedInterests = (userObj.interests || []).filter(i => (req.user.interests || []).includes(i));
      score += sharedInterests.length * 20;
      
      return { ...userObj, compatibilityScore: score };
    });

    processedUsers.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    if (!isPremium) {
      processedUsers = processedUsers.map(u => {
        const userObj = typeof u.toObject === 'function' ? u.toObject() : u;
        let distance = null;
        {
          const { lat: myLat, lng: myLng } = extractLatLng(req.user.location);
          distance = distanceToUser(myLat, myLng, userObj.location);
        }

        return {
          _id: userObj._id,
          name: userObj.name,
          age: userObj.age,
          photos: userObj.photos ? [userObj.photos[0]] : [],
          isBlurred: true,
          bio: undefined,
          interests: [],
          location: undefined,
          distance: distance,
          verified: userObj.verified,
          gender: userObj.gender,
          personalityType: userObj.personalityType
        };
      });
    }

    const total   = processedUsers.length;
    const skip    = (page - 1) * limit;
    const paged   = processedUsers.slice(skip, skip + limit);
    const hasMore = skip + paged.length < total;

    const payload = { users: paged, total, page, limit, hasMore };
    await redis.set(cacheKey, payload, 60);
    res.json({ success: true, ...payload });
  } catch (error) {
    logger.error('Who likes me error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/swipe', protect, swipeLimiter, validate(schemas.match.swipe), async (req, res) => {
  try {
    const { targetUserId, action } = req.body;

    // Face verification gate — prevents any API-level bypass
    const swipeGateUser = await User.findById(req.user._id).select('isFaceVerified verificationStatus');
    if (!swipeGateUser || !swipeGateUser.isFaceVerified || swipeGateUser.verificationStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Face verification required to interact with profiles',
        verificationRequired: true,
        verificationStatus: swipeGateUser?.verificationStatus || 'not_requested',
      });
    }

    if (!req.user.premium?.isActive) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const swipeKey = `swipecount:${req.user._id}:${todayStr}`;
      const redisCount = await redis.incr(swipeKey);

      if (redisCount !== null) {
        if (redisCount === 1) {
          const secondsUntilMidnight = Math.floor(
            (new Date().setUTCHours(24, 0, 0, 0) - Date.now()) / 1000
          );
          await redis.expire(swipeKey, secondsUntilMidnight);
        }
        if (redisCount > 10) {
          return res.status(403).json({ success: false, message: 'Daily swipe limit reached (10/day). Upgrade to Premium!' });
        }
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const lastReset = new Date(req.user.dailySwipes.lastReset);
        lastReset.setHours(0, 0, 0, 0);

        if (lastReset < today) {
          req.user.dailySwipes.count = 0;
          req.user.dailySwipes.lastReset = new Date();
        }

        if (req.user.dailySwipes.count >= 10) {
          return res.status(403).json({ success: false, message: 'Daily swipe limit reached (10/day). Upgrade to Premium!' });
        }
        req.user.dailySwipes.count += 1;
      }
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    const currentUser = await User.findById(req.user._id);

    if (action === 'like' || action === 'superlike') {
      // Daily Super-Like cap: 5/day for Premium, 1/day for Free.
      // Counts are stored in Redis under `superlikecount:<userId>:<YYYY-MM-DD>`
      // and expire at UTC midnight. Falls back to the existing `dailySwipes`
      // shape on the user document if Redis is unavailable.
      if (action === 'superlike') {
        const isPremium = !!req.user.premium?.isActive;
        const dailyCap = isPremium ? 5 : 1;
        const todayStr = new Date().toISOString().slice(0, 10);
        const slKey = `superlikecount:${req.user._id}:${todayStr}`;
        const usedFromRedis = await redis.incr(slKey);

        if (usedFromRedis !== null) {
          if (usedFromRedis === 1) {
            const secondsUntilMidnight = Math.floor(
              (new Date().setUTCHours(24, 0, 0, 0) - Date.now()) / 1000
            );
            await redis.expire(slKey, secondsUntilMidnight);
          }
          if (usedFromRedis > dailyCap) {
            const upgradeHint = isPremium
              ? `Daily Super Like limit reached (${dailyCap}/day). Resets at midnight.`
              : `Daily Super Like limit reached (${dailyCap}/day). Upgrade to Premium for ${5}/day.`;
            return res.status(403).json({
              success: false,
              code: 'SUPERLIKE_LIMIT_REACHED',
              message: upgradeHint,
              dailyCap,
              isPremium,
            });
          }
        } else {
          // Redis unavailable — fall back to a per-user counter on the User doc.
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const last = currentUser.superLikesDaily?.lastReset
            ? new Date(currentUser.superLikesDaily.lastReset)
            : new Date(0);
          last.setHours(0, 0, 0, 0);
          if (!currentUser.superLikesDaily || last < today) {
            currentUser.superLikesDaily = { count: 0, lastReset: new Date() };
          }
          if ((currentUser.superLikesDaily.count || 0) >= dailyCap) {
            return res.status(403).json({
              success: false,
              code: 'SUPERLIKE_LIMIT_REACHED',
              message: isPremium
                ? `Daily Super Like limit reached (${dailyCap}/day).`
                : `Daily Super Like limit reached (${dailyCap}/day). Upgrade to Premium for 5/day.`,
              dailyCap,
              isPremium,
            });
          }
          currentUser.superLikesDaily.count = (currentUser.superLikesDaily.count || 0) + 1;
        }
      }

      if (!currentUser.swipedRight.includes(targetUserId)) {
        currentUser.swipedRight.push(targetUserId);
      }
      currentUser.lastSwipeAction = { targetId: targetUserId, direction: 'right' };

      if (action === 'superlike') {
        if (!currentUser.superLiked.includes(targetUserId)) {
          currentUser.superLiked.push(targetUserId);
        }
      }

      if (targetUser.swipedRight.includes(currentUser._id)) {
        const existingMatch = await Match.findOne({
          users: { $all: [currentUser._id, targetUser._id] },
          status: 'active'
        });
        
        if (existingMatch) {
          await currentUser.save();
          return res.json({ success: true, isMatch: true, match: existingMatch });
        }
        
        const match = await Match.create({
          users: [currentUser._id, targetUser._id],
          isSuperLike: action === 'superlike'
        });

        await currentUser.save();

        // Track matchesGained for any boosted user involved in this match (fire-and-forget)
        setImmediate(async () => {
          try {
            const [boostA, boostB] = await Promise.all([
              Boost.getActiveBoost(currentUser._id),
              Boost.getActiveBoost(targetUserId),
            ]);
            if (boostA) await boostA.incrementStat('matchesGained');
            if (boostB) await boostB.incrementStat('matchesGained');
          } catch (_) {}
        });

        try {
          const { sendSmartNotification } = require('../utils/pushNotifications');
          const [currentUserFull, targetUserFull] = await Promise.all([
            User.findById(currentUser._id).select('pushToken pushNotificationsEnabled muteSettings notificationPreferences name'),
            User.findById(targetUserId).select('pushToken pushNotificationsEnabled muteSettings notificationPreferences name'),
          ]);
          if (currentUserFull) {
            sendSmartNotification(currentUserFull, {
              title: "It's a Match! 🎉",
              body: `You and ${targetUser.name} liked each other!`,
              data: {
                type: 'match',
                senderId: String(targetUser._id),
                senderName: targetUser.name,
                senderPhoto: targetUser.photos?.[0] || null,
              },
            }, 'match').catch(() => {});
          }
          if (targetUserFull) {
            sendSmartNotification(targetUserFull, {
              title: "It's a Match! 🎉",
              body: `You and ${currentUser.name} liked each other!`,
              data: {
                type: 'match',
                senderId: String(currentUser._id),
                senderName: currentUser.name,
                senderPhoto: currentUser.photos?.[0] || null,
              },
            }, 'match').catch(() => {});
          }
        } catch (pushErr) {
          logger.error('Match push notification error (non-critical):', pushErr.message);
        }

        try {
          const Notification = require('../models/Notification');
          await Promise.all([
            Notification.create({
              recipient: currentUser._id,
              sender: targetUser._id,
              type: 'match',
              title: "It's a Match! 🎉",
              body: `You and ${targetUser.name} liked each other!`,
              data: { matchId: match._id, userId: String(targetUser._id) },
            }),
            Notification.create({
              recipient: targetUser._id,
              sender: currentUser._id,
              type: 'match',
              title: "It's a Match! 🎉",
              body: `You and ${currentUser.name} liked each other!`,
              data: { matchId: match._id, userId: String(currentUser._id) },
            }),
          ]);
        } catch (notifErr) {
          logger.error('Match in-app notification error (non-critical):', notifErr.message);
        }

        try {
          const { sendNewMatchEmail } = require('../utils/emailService');
          const currentUserPhoto = currentUser.photos?.[0] || null;
          const targetUserPhoto  = targetUser.photos?.[0] || null;
          await Promise.all([
            sendNewMatchEmail(currentUser.email, currentUser.name, targetUser.name, targetUserPhoto),
            sendNewMatchEmail(targetUser.email,  targetUser.name,  currentUser.name, currentUserPhoto),
          ]);
        } catch (emailErr) {
          logger.error('Match email error (non-critical):', emailErr.message);
        }

        return res.json({ success: true, isMatch: true, match });
      }
    } else if (action === 'pass') {
      if (!currentUser.swipedLeft.includes(targetUserId)) {
        currentUser.swipedLeft.push(targetUserId);
      }
      currentUser.lastSwipeAction = { targetId: targetUserId, direction: 'left' };
      const FriendRequest = require('../models/FriendRequest');
      await FriendRequest.updateMany(
        { sender: targetUserId, receiver: currentUser._id, status: 'pending' },
        { status: 'rejected' }
      );
    }

    await currentUser.save();

    if (action === 'like' || action === 'superlike') {
      try {
        const { sendSmartNotification } = require('../utils/pushNotifications');
        const targetUserForNotif = await User.findById(targetUserId).select(
          'pushToken pushNotificationsEnabled muteSettings notificationPreferences'
        );
        if (targetUserForNotif) {
          const isSuper = action === 'superlike';
          sendSmartNotification(
            targetUserForNotif,
            {
              title: isSuper ? '⭐ You got a Super Like!' : '💚 Someone liked you!',
              body: isSuper
                ? `${currentUser.name} Super Liked your profile — open Emorii to see!`
                : 'Someone on Emorii liked your profile. Come see!',
              data: {
                type: isSuper ? 'super_like' : 'like',
                screen: 'Likes',
                senderId: String(currentUser._id),
                senderName: currentUser.name,
                senderPhoto: currentUser.photos?.[0] || null,
              },
            },
            'like',
          ).catch(() => {});
          logger.log(`[Push] Like notification queued → user ${targetUserId} (${isSuper ? 'superlike' : 'like'})`);
        }
      } catch (likeNotifErr) {
        logger.error('[Push] Like notification error (non-critical):', likeNotifErr.message);
      }

      try {
        const Notification = require('../models/Notification');
        const isSuper = action === 'superlike';
        await Notification.create({
          recipient: targetUserId,
          sender: currentUser._id,
          type: isSuper ? 'super_like' : 'like',
          title: isSuper ? '⭐ You got a Super Like!' : '💚 Someone liked you!',
          body: isSuper
            ? `${currentUser.name} Super Liked your profile!`
            : 'Someone liked your profile — tap to see who',
          data: { type: isSuper ? 'super_like' : 'like', userId: String(currentUser._id) },
        });
      } catch (likeInAppErr) {
        logger.error('[InApp] Like notification error (non-critical):', likeInAppErr.message);
      }
    }

    // Track likesGained for a boosted target user (fire-and-forget)
    if (action === 'like' || action === 'superlike') {
      setImmediate(async () => {
        try {
          const activeBoost = await Boost.getActiveBoost(targetUserId);
          if (activeBoost) await activeBoost.incrementStat('likesGained');
        } catch (_) {}
      });
    }

    await Promise.all([
      redis.del(`wholikesme:${targetUserId}:premium`),
      redis.del(`wholikesme:${targetUserId}:free`),
      redis.del(`matches:${req.user._id}`),
      redis.del(`matches:${targetUserId}`),
      redis.del(`secondchance:${req.user._id}`),
    ]);
    res.json({ success: true, isMatch: false, message: 'Swipe recorded' });
  } catch (error) {
    logger.error('Swipe error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/my-matches', protect, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const cacheKey = `matches:${req.user._id}:p${page}:l${limit}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ success: true, ...cached, fromCache: true });

    const currentUser = await User.findById(req.user._id);
    const matches = await Match.find({ users: req.user._id, status: 'active' })
      .populate('users', 'name age bio photos location onlineStatus lastActive interests lookingFor gender lifestyle verified privacySettings')
      .sort({ matchedAt: -1 });

    const seenUserIds = new Set();
    const uniqueMatches = matches.filter(match => {
      const otherUser = match.users.find(u => u._id.toString() !== req.user._id.toString());
      if (!otherUser || seenUserIds.has(otherUser._id.toString())) return false;
      seenUserIds.add(otherUser._id.toString());
      return true;
    });

    const enriched = uniqueMatches.map(match => {
      const matchObj = match.toObject();
      const expiresAt = match.hasFirstMessage ? null : match.expiresAt;
      const now = new Date();
      const isExpired = expiresAt && new Date(expiresAt) < now;
      const msLeft = expiresAt ? Math.max(0, new Date(expiresAt) - now) : null;

      const otherUser = match.users.find(u => u._id.toString() !== req.user._id.toString());
      const myInterests = currentUser.interests || [];
      const theirInterests = (otherUser && otherUser.interests) ? otherUser.interests : [];
      const sharedCount = myInterests.filter(i => theirInterests.includes(i)).length;
      const computedScore = Math.min(100, 60 + sharedCount * 8);

      // Honor each user's "hide online status" privacy setting before
      // exposing presence info to the requester.
      if (Array.isArray(matchObj.users)) {
        matchObj.users = matchObj.users.map((u) => {
          const showOnline = u && u.privacySettings && u.privacySettings.showOnlineStatus !== false;
          if (!showOnline) {
            return { ...u, onlineStatus: null, lastActive: null };
          }
          // Don't leak the privacy block to the client.
          const { privacySettings, ...rest } = u;
          return rest;
        });
      }

      return {
        ...matchObj,
        expiresAt,
        isExpired,
        msLeft,
        compatibilityScore: match.compatibilityScore || computedScore
      };
    });

    const total   = enriched.length;
    const skip    = (page - 1) * limit;
    const paged   = enriched.slice(skip, skip + limit);
    const hasMore = skip + paged.length < total;

    const payload = { matches: paged, total, page, limit, hasMore };
    await redis.set(cacheKey, payload, 45);
    res.json({ success: true, ...payload });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/second-chance', protect, async (req, res) => {
  try {
    const cacheKey = `secondchance:${req.user._id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ success: true, profiles: cached, fromCache: true });

    const user = await User.findById(req.user._id).select('swipedLeft secondChancePasses');
    const passedIds = (user.secondChancePasses || []).map(p => p.targetUserId.toString());
    const eligibleIds = (user.swipedLeft || [])
      .filter(id => !passedIds.includes(id.toString()))
      .slice(-20);

    if (eligibleIds.length === 0) {
      return res.json({ success: true, profiles: [] });
    }

    const profiles = await User.find({
      _id: { $in: eligibleIds },
      // Exclude users who have enabled Incognito Mode — they should not
      // surface in any discovery / suggestion feed.
      'privacySettings.incognitoMode': { $ne: true },
    })
      .select('name age bio photos interests verified location lifestyle gender');

    const processedProfiles = profiles.map(p => {
      const pObj = p.toObject();
      const myInterests = user.interests || [];
      const sharedInterests = (pObj.interests || []).filter(i => myInterests.includes(i));
      return { ...pObj, sharedInterests };
    });

    await redis.set(cacheKey, processedProfiles, 120);
    res.json({ success: true, profiles: processedProfiles });
  } catch (error) {
    logger.error('Second chance error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/second-chance/pass', protect, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ success: false, message: 'targetUserId required' });
    await User.findByIdAndUpdate(req.user._id, {
      $push: { secondChancePasses: { targetUserId } }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/boost', protect, async (req, res) => {
  try {
    if (!req.user.premium?.isActive) {
      return res.status(403).json({ success: false, message: 'Boost is a Premium feature!' });
    }
    const boost = await Boost.create({ user: req.user._id, expiresAt: Date.now() + 30 * 60 * 1000 });
    res.json({ success: true, message: 'Profile boosted!', expiresAt: boost.expiresAt });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/rewind', protect, async (req, res) => {
  try {
    if (!req.user.premium?.isActive) {
      return res.status(403).json({ success: false, message: 'Rewind is a Premium feature!' });
    }
    const user = await User.findById(req.user._id);

    const last = user.lastSwipeAction;
    if (!last || !last.targetId || !last.direction) {
      return res.status(400).json({ success: false, message: 'No swipes to rewind' });
    }

    const targetId = last.targetId.toString();

    if (last.direction === 'right') {
      user.swipedRight = user.swipedRight.filter(id => id.toString() !== targetId);
      user.superLiked = user.superLiked.filter(id => id.toString() !== targetId);
    } else {
      user.swipedLeft = user.swipedLeft.filter(id => id.toString() !== targetId);
    }

    user.lastSwipeAction = { targetId: null, direction: null };
    await user.save();
    res.json({ success: true, message: 'Last swipe rewound!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/cultural-score/:userId', protect, async (req, res) => {
  try {
    const cacheKey = `culturalscore:${req.user._id}:${req.params.userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ success: true, ...cached, fromCache: true });

    const me = await User.findById(req.user._id);
    const other = await User.findById(req.params.userId)
      .select('countryOfOrigin tribe languages diasporaGeneration lifestyle interests');

    if (!other) return res.status(404).json({ success: false, message: 'User not found' });

    const breakdown = calculateCulturalScore(me, other);
    await redis.set(cacheKey, breakdown, 300);
    res.json({ success: true, ...breakdown });
  } catch (error) {
    logger.error('Cultural score error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/daily-match', protect, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const me = await User.findById(req.user._id);

    if (!me) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (me.dailyMatch?.date === today && me.dailyMatch?.userId) {
      try {
        const cached = await User.findById(me.dailyMatch.userId)
          .select('name age bio photos interests lifestyle countryOfOrigin tribe languages diasporaGeneration location verified premium onlineStatus voiceBio');
        if (cached) {
          const score = calculateCulturalScore(me, cached);
          return res.json({ success: true, match: { ...cached.toObject(), culturalScore: score.totalScore, culturalBreakdown: score.breakdown } });
        }
      } catch (cacheErr) {
        logger.error('Daily match cache lookup failed:', cacheErr.message);
      }
    }

    const alreadySwiped = [
      ...(me.swipedRight || []),
      ...(me.swipedLeft || []),
      me._id
    ].map(id => id.toString());

    const genderPref = me.preferences?.genderPreference || 'both';
    const genderFilter = genderPref === 'both'
      ? {}
      : { gender: genderPref === 'male' ? { $in: ['male', 'man'] } : { $in: ['female', 'woman'] } };

    let candidates = await User.find({
      _id: { $nin: alreadySwiped },
      banned: { $ne: true },
      emailVerified: true,
      'photos.0': { $exists: true },
      age: { $gte: me.preferences?.ageRange?.min || 18, $lte: me.preferences?.ageRange?.max || 60 },
      // Hide users in Incognito Mode from the daily match suggestion pool.
      'privacySettings.incognitoMode': { $ne: true },
      ...genderFilter
    }).select('name age bio photos interests lifestyle countryOfOrigin tribe languages diasporaGeneration location verified premium onlineStatus voiceBio').limit(300);

    const maxDist = normaliseMaxDistanceKm(me.preferences?.maxDistance, 0);
    if (maxDist > 0) {
      const { lat: myLat, lng: myLng } = extractLatLng(me.location);
      if (myLat != null && myLng != null) {
        candidates = candidates.filter(c => {
          const d = distanceToUser(myLat, myLng, c.location);
          return d == null || d <= maxDist;
        });
      }
    }

    if (!candidates.length) {
      return res.json({ success: true, match: null, message: 'No match available today. Check back tomorrow!' });
    }

    const scored = candidates.map(c => {
      try {
        const cultural = calculateCulturalScore(me, c);
        const sharedInterests = (me.interests || []).filter(i => (c.interests || []).includes(i)).length;
        const total = cultural.totalScore * 0.6 + sharedInterests * 5;
        return { user: c, culturalScore: cultural, interestScore: sharedInterests, totalScore: total };
      } catch (scoreErr) {
        return { user: c, culturalScore: { totalScore: 0, breakdown: [] }, interestScore: 0, totalScore: 0 };
      }
    });

    scored.sort((a, b) => b.totalScore - a.totalScore);
    const best = scored[0];

    try {
      me.dailyMatch = { userId: best.user._id, date: today };
      await me.save();
    } catch (saveErr) {
      logger.error('Failed to cache daily match:', saveErr.message);
    }

    return res.json({
      success: true,
      match: {
        ...best.user.toObject(),
        culturalScore: best.culturalScore.totalScore,
        culturalBreakdown: best.culturalScore.breakdown,
        sharedInterests: best.interestScore
      }
    });
  } catch (error) {
    logger.error('Daily match error:', error);
    return res.status(500).json({ success: false, message: 'Could not load match. Please try again.' });
  }
});

function calculateCulturalScore(me, other) {
  const breakdown = [];
  let total = 0;

  const countryScore = me.countryOfOrigin && other.countryOfOrigin &&
    me.countryOfOrigin.toLowerCase() === other.countryOfOrigin.toLowerCase() ? 25 : 0;
  breakdown.push({ label: 'Country of Origin', score: countryScore, max: 25,
    mine: me.countryOfOrigin || null, theirs: other.countryOfOrigin || null });
  total += countryScore;

  const tribeScore = me.tribe && other.tribe &&
    me.tribe.toLowerCase() === other.tribe.toLowerCase() ? 20 : 0;
  breakdown.push({ label: 'Tribe / Ethnicity', score: tribeScore, max: 20,
    mine: me.tribe || null, theirs: other.tribe || null });
  total += tribeScore;

  const myLangs = (me.languages || []).map(l => l.toLowerCase());
  const theirLangs = (other.languages || []).map(l => l.toLowerCase());
  const sharedLangs = myLangs.filter(l => theirLangs.includes(l));
  const langScore = sharedLangs.length > 0 ? Math.min(20, sharedLangs.length * 10) : 0;
  breakdown.push({ label: 'Language', score: langScore, max: 20,
    mine: me.languages || [], theirs: other.languages || [], shared: sharedLangs });
  total += langScore;

  const myRel = me.lifestyle?.religion;
  const theirRel = other.lifestyle?.religion;
  const relScore = myRel && theirRel && myRel === theirRel ? 20 : 0;
  breakdown.push({ label: 'Religion', score: relScore, max: 20,
    mine: myRel || null, theirs: theirRel || null });
  total += relScore;

  const myGen = me.diasporaGeneration;
  const theirGen = other.diasporaGeneration;
  const genScore = myGen && theirGen && myGen === theirGen ? 15 : (myGen && theirGen ? 5 : 0);
  breakdown.push({ label: 'Diaspora Generation', score: genScore, max: 15,
    mine: myGen || null, theirs: theirGen || null });
  total += genScore;

  return { totalScore: total, maxScore: 100, breakdown };
}

module.exports = router;
