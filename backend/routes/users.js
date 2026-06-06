const logger = require('../utils/logger');
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Boost = require('../models/Boost');
const { sendOTP } = require('../utils/emailService');
const crypto = require('crypto'); // For generating OTP
const redis = require('../utils/redis');
const { distanceToUser, normaliseMaxDistanceKm } = require('../utils/distance');
const { calculateMatchScore } = require('../utils/matching');
const { discoveryLimiter, searchLimiter } = require('../middleware/rateLimiter');
const { notifyExhaustedUsersOfNewMember } = require('../utils/discoveryNotifier');

// Cache key for the countries list endpoint.
const COUNTRIES_CACHE_KEY = 'countries:list';
const COUNTRIES_CACHE_TTL = 5 * 60; // 5 minutes

/**
 * Invalidate location-dependent caches.
 *
 * @param {string}  userId          – whose profile cache to bust.
 * @param {boolean} locationChanged – pass true only when coordinates or country
 *   actually changed. The expensive O(N) `discovery:*` pattern-delete is
 *   skipped for profile-only saves (bio, photos, preferences) because those
 *   fields don't affect which users appear in other users' discovery results.
 *   M-14: avoids thousands of Redis key deletions on every profile update.
 */
async function invalidateLocationCaches(userId, locationChanged = false) {
  try {
    const ops = [
      redis.del(COUNTRIES_CACHE_KEY),
      redis.del(`profile:me:${userId}`),
    ];
    if (locationChanged) {
      // Only run the full pattern-delete when coordinates/country changed —
      // this is the only update that alters who appears in discovery results.
      ops.push(redis.delPattern('discovery:*'));
    }
    await Promise.all(ops);
    logger.log(`[Cache] Caches invalidated for user ${userId} (locationChanged=${locationChanged})`);
  } catch (err) {
    logger.warn('[Cache] Cache invalidation error (non-fatal):', err?.message);
  }
}

function parseLivingIn(livingIn) {
  if (!livingIn || typeof livingIn !== 'string') return {};
  const parts = livingIn.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { city: parts[0] };
  return { city: parts.slice(0, -1).join(', '), country: parts[parts.length - 1] };
}

function normaliseLocationUpdate(location, livingIn) {
  if (!location || typeof location !== 'object') return location;

  const parsedLivingIn = parseLivingIn(livingIn);
  const coords = Array.isArray(location.coordinates) && location.coordinates.length >= 2
    ? [Number(location.coordinates[0]), Number(location.coordinates[1])]
    : null;
  const lng = location.lng ?? location.longitude ?? (coords ? coords[0] : undefined);
  const lat = location.lat ?? location.latitude ?? (coords ? coords[1] : undefined);
  const numericLat = Number(lat);
  const numericLng = Number(lng);

  const nextLocation = {
    type: 'Point',
    city: location.city || parsedLivingIn.city,
    country: location.country || parsedLivingIn.country
  };

  if (
    Number.isFinite(numericLat) &&
    Number.isFinite(numericLng) &&
    // Reject "null island" — [0, 0] is the Mongoose default for users who
    // have never set their location. Storing it makes them appear to be in
    // the Gulf of Guinea and causes them to show up (or be hidden) in
    // discovery searches centered near [0, 0]. We treat the exact zero-pair
    // as "no location provided" so the coordinates field is left unset and
    // the Mongoose default is NOT written back to the document.
    !(numericLat === 0 && numericLng === 0) &&
    numericLat >= -90 &&
    numericLat <= 90 &&
    numericLng >= -180 &&
    numericLng <= 180
  ) {
    nextLocation.coordinates = [numericLng, numericLat];
  }

  return nextLocation;
}


router.get('/me', protect, async (req, res) => {
  try {
    if (!req.user.emailVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first' });
    }
    const cacheKey = `profile:me:${req.user._id}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json({ success: true, user: cached.user, needsVerification: cached.needsVerification, profileIncomplete: cached.profileIncomplete, fromCache: true });

    const user = await User.findById(req.user._id);
    const userObj = user.toObject();
    // Strip device push tokens — the app registers these directly via
    // Firebase/Expo; returning them in the profile response would cache
    // live device credentials in Redis and send them over the wire
    // unnecessarily. They are never needed by the client as API data.
    delete userObj.pushToken;
    delete userObj.pushTokenUpdatedAt;
    delete userObj.fcmToken;
    delete userObj.fcmTokenUpdatedAt;
    delete userObj.voipPushToken;
    const payload = {
      user: userObj,
      needsVerification: !user.verified,
      profileIncomplete: !user.photos || user.photos.length === 0
    };
    await redis.set(cacheKey, payload, 60);
    res.json({ success: true, ...payload });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/me', protect, require('../middleware/validate')(require('../validators/schemas').updateProfile), async (req, res) => {
  try {
    if (!req.user.emailVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first' });
    }

    const updates = req.body;
    const allowedUpdates = [
      'name', 'age', 'gender', 'bio', 'interests', 'photos', 'lookingFor', 
      'preferences', 'location', 'favoriteSong', 'zodiacSign', 'relationshipGoal',
      'jobTitle', 'education', 'school', 'livingIn', 'lifestyle', 'ethnicity', 
      'communicationStyle', 'loveStyle', 'personalityType', 'privacySettings',
      'pets', 'relationshipStatus',
      'height', 'countryOfOrigin', 'tribe', 'languages', 'diasporaGeneration', 'language',
      'autoUpdateProfileLocation', 'locationSharingEnabled',
    ];

    const user = await User.findById(req.user._id);
    const isPremium = user.premium?.isActive;

    // M-14: Track whether coordinates/country actually changed so we can skip
    // the expensive O(N) discovery:* pattern-delete for profile-only updates.
    let locationChanged = false;

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'photos' && Array.isArray(updates[field]) && updates[field].length > 0) {
          user.photos = updates[field].map((photo, index) => ({
            ...photo,
            isPrimary: index === 0,
            order: index
          }));
        }

        else if (field === 'preferences') {
          const allowedPrefKeys = ['ageRange', 'genderPreference', 'maxDistance', 'showOnlineOnly', 'showVerifiedOnly', 'dealBreakers', 'language', 'smoking', 'drinking', 'wantsKids', 'onlineNow', 'interests', 'autoTranslate'];
          allowedPrefKeys.forEach(prefKey => {
            if (!Object.prototype.hasOwnProperty.call(updates.preferences, prefKey) || updates.preferences[prefKey] === undefined) return;
            if (prefKey === 'ageRange' && updates.preferences.ageRange) {
              user.preferences.ageRange = {
                ...(user.preferences.ageRange || {}),
                ...updates.preferences.ageRange
              };
            } else if (prefKey === 'maxDistance') {
              const maxDistance = normaliseMaxDistanceKm(updates.preferences.maxDistance, 50);
              user.preferences.maxDistance = isPremium ? maxDistance : Math.min(maxDistance, 50);
            } else if (prefKey === 'showVerifiedOnly') {
              user.preferences.showVerifiedOnly = isPremium ? updates.preferences.showVerifiedOnly : false;
            } else {
              user.preferences[prefKey] = updates.preferences[prefKey];
            }
          });
          if (Array.isArray(updates.preferences.genders) && updates.preferences.genders.length > 0) {
            const g = updates.preferences.genders;
            user.preferences.genderPreference = g.length === 1 ? g[0] : 'both';
          }
        } else if (field === 'lifestyle' && updates.lifestyle) {
          const lifestyleUpdate = { ...updates.lifestyle };
          if (Array.isArray(lifestyleUpdate.pets)) {
            lifestyleUpdate.pets = lifestyleUpdate.pets.join(',');
          }
          user.lifestyle = {
            ...(user.lifestyle && typeof user.lifestyle.toObject === 'function' ? user.lifestyle.toObject() : (user.lifestyle || {})),
            ...lifestyleUpdate
          };
        } else if (field === 'privacySettings' && updates.privacySettings) {
          if (updates.privacySettings.incognitoMode === true && !user.premium?.isActive) {
            return res.status(403).json({ success: false, message: 'Incognito mode is a premium feature' });
          }
          user.privacySettings = {
            ...(user.privacySettings || {}),
            ...updates.privacySettings
          };
        } else if (['communicationStyle', 'loveStyle', 'personalityType'].includes(field)) {
          const currentLifestyle = user.lifestyle && typeof user.lifestyle.toObject === 'function'
            ? user.lifestyle.toObject()
            : (user.lifestyle || {});
          user.lifestyle = { ...currentLifestyle, [field]: updates[field] };
        } else if (field === 'location') {
          user.location = normaliseLocationUpdate(updates.location, updates.livingIn ?? user.livingIn);
          user.locationUpdatedAt = new Date();
          locationChanged = true; // M-14: flag for targeted cache invalidation
        } else if (Object.prototype.hasOwnProperty.call(updates, field)) {
          user[field] = updates[field];
        }
      }
    });

    await user.save();

    // M-14: Pass locationChanged so invalidateLocationCaches skips the
    // expensive discovery:* pattern-delete for non-location profile saves.
    await invalidateLocationCaches(req.user._id, locationChanged);

    // Fire-and-forget: if this update included a location change and the user
    // is already face-verified, notify nearby exhausted users so the updated
    // profile card appears in their deck right away.  This covers the case
    // where a verified user moves cities via the profile editor (not radar).
    if (updates.location && user.isFaceVerified && user.verificationStatus === 'approved') {
      const freshUser = await User.findById(user._id).lean();
      const io = req.app.get('io');
      notifyExhaustedUsersOfNewMember(freshUser, io).catch(() => {});
    }

    res.json({ 
      success: true, 
      user,
      needsVerification: !user.verified,
      profileIncomplete: !user.photos || user.photos.length === 0
    });
  } catch (error) {
    logger.error('Profile update error:', error);
    let message = 'Server error';
    if (error.name === 'ValidationError') {
      message = Object.values(error.errors).map(e => e.message).join(', ');
    } else if (error.message) {
      message = error.message;
    }
    res.status(500).json({ success: false, message });
  }
});

router.get('/search', protect, searchLimiter, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    if (!req.user.emailVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first' });
    }

    // Escape all regex metacharacters before passing user input to $regex.
    // Without this, a crafted pattern like "(a+)+$" can cause catastrophic
    // backtracking inside MongoDB, hanging the thread for seconds (ReDoS).
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safeQuery = escapeRegex(query);

    const users = await User.find({
      _id: { $ne: req.user.id },
      verified: true, // Only search for verified users
      $or: [
        { name: { $regex: safeQuery, $options: 'i' } }
      ]
    })
    .select('-password -resetPasswordToken -resetPasswordExpire -verificationOTP -verificationOTPExpire -email -resetPasswordOTP -resetPasswordOTPExpire -banned -banReason -bannedAt -appeal -suspended -suspendedUntil -tokenVersion -pushToken -pushTokenUpdatedAt -fcmToken -fcmTokenUpdatedAt -voipPushToken -liveLocation')
    .limit(20);

    res.json({
      success: true,
      users
    });
  } catch (error) {
    logger.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.get('/countries', protect, async (req, res) => {
  try {
    // Serve from cache when available — invalidated any time a user's
    // location.country changes so the picker is always up to date.
    const cached = await redis.get(COUNTRIES_CACHE_KEY);
    if (cached) {
      return res.json({ success: true, countries: cached, fromCache: true });
    }

    // Collect countries from BOTH location.country and liveLocation.country.
    // autoUpdateProfileLocation defaults to false, so many users only have
    // their country in liveLocation (the GPS-ping field), not in location
    // (the profile field). Merging both ensures the picker shows every
    // country where real users actually are.
    const baseFilter = { banned: { $ne: true }, suspended: { $ne: true } };
    const [profileCountries, liveCountries] = await Promise.all([
      User.distinct('location.country', {
        ...baseFilter,
        'location.country': { $exists: true, $nin: [null, ''] },
      }),
      User.distinct('liveLocation.country', {
        ...baseFilter,
        'liveLocation.country': { $exists: true, $nin: [null, ''] },
      }),
    ]);
    const allCountries = [...new Set([...profileCountries, ...liveCountries])];

    // Normalise known country-name variants so the picker shows one canonical
    // entry per country regardless of which geocoding API stored the name.
    const CANONICAL = {
      'turkey':          'Türkiye',
      'czech republic':  'Czechia',
      "côte d'ivoire":   'Ivory Coast',
      "cote d'ivoire":   'Ivory Coast',
      'cabo verde':      'Cape Verde',
      'macedonia':       'North Macedonia',
      'burma':           'Myanmar',
      'swaziland':       'Eswatini',
      'democratic republic of congo': 'DR Congo',
      'drc':             'DR Congo',
    };

    const seen = new Set();
    const normalised = [];
    for (const c of allCountries) {
      if (!c || !c.trim()) continue;
      const canonical = CANONICAL[c.trim().toLowerCase()] || c.trim();
      if (!seen.has(canonical.toLowerCase())) {
        seen.add(canonical.toLowerCase());
        normalised.push(canonical);
      }
    }
    normalised.sort();

    // Cache the result — invalidated on any location.country update.
    await redis.set(COUNTRIES_CACHE_KEY, normalised, COUNTRIES_CACHE_TTL);

    res.json({ success: true, countries: normalised });
  } catch (error) {
    logger.error('Countries list error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Frontend pings this when the discovery deck returns 0 cards. We record the
// timestamp so a scheduled job can later send a "new people are waiting!"
// push notification once fresh users become available.
router.post('/discovery-stack-exhausted', protect, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.id },
      { $set: { discoveryStackExhaustedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/nearby', protect, discoveryLimiter, async (req, res) => {
  let inflightCacheKey = null;
  let resolveInflight = null;
  let rejectInflight = null;
  try {
    const {
      lat, lng, maxDistance, minAge, maxAge, genders,
      lookingFor, religion, smoking, drinking, wantsKids,
      verifiedOnly, onlineOnly,
    } = req.query;
    const isGlobal = req.query.global === 'true';
    const countryFilter = req.query.country;

    if (!req.user.emailVerified && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Please verify your email first' });
    }

    // Fetch the gate fields and the full current-user document in parallel.
    // Previously these were two sequential awaits (~150–200 ms each on cold
    // Mongo connections). Running them together halves that wait time.
    // The gate check runs immediately after both resolve; gated users get
    // rejected before any further processing happens.
    const cursor = req.query.cursor ? String(req.query.cursor) : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 60);

    const [gateUser, currentUser] = await Promise.all([
      User.findById(req.user._id).select('isFaceVerified verificationStatus verified'),
      User.findById(req.user.id),
    ]);

    // Face verification gate — enforced in all environments.
    if (!gateUser || !gateUser.isFaceVerified || gateUser.verificationStatus !== 'approved') {
      logger.log(
        `[DISCOVERY:GATE] Blocked userId=${req.user._id}` +
        ` isFaceVerified=${gateUser?.isFaceVerified}` +
        ` verificationStatus=${gateUser?.verificationStatus}` +
        ` verified=${gateUser?.verified}`
      );
      return res.status(403).json({
        success: false,
        message: 'Face verification required',
        verificationRequired: true,
        verificationStatus: gateUser?.verificationStatus || 'not_requested',
      });
    }

    const normLat  = Math.round((parseFloat(lat)  || 0) * 10);
    const normLng  = Math.round((parseFloat(lng)  || 0) * 10);
    const normDist = parseInt(maxDistance) || '';
    const normMin  = parseInt(minAge)      || '';
    const normMax  = parseInt(maxAge)      || '';
    const normGen  = (genders || '').split(',').sort().join(',');
    const cacheKey = `discovery:${req.user.id}:${isGlobal}:${countryFilter || ''}:${normLat}:${normLng}:${normDist}:${normMin}:${normMax}:${normGen}:${cursor || ''}:${limit}:${currentUser?.updatedAt ? new Date(currentUser.updatedAt).getTime() : ''}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({ success: true, users: cached.users || cached, nextCursor: cached.nextCursor || null, fromCache: true });
    }

    // In-process stampede lock: if another request for the same key is already
    // computing, wait briefly for it to populate the cache instead of running
    // the same expensive query in parallel.
    const inflight = req.app.get('discoveryInflight') || new Map();
    if (!req.app.get('discoveryInflight')) req.app.set('discoveryInflight', inflight);
    if (inflight.has(cacheKey)) {
      try {
        const result = await inflight.get(cacheKey);
        return res.json({ success: true, users: result.users, nextCursor: result.nextCursor, fromCache: true });
      } catch (_) {
        // fall through and recompute
      }
    }
    const inflightPromise = new Promise((resolve, reject) => {
      resolveInflight = resolve;
      rejectInflight = reject;
    });
    inflight.set(cacheKey, inflightPromise);
    inflightCacheKey = cacheKey;

    if (isGlobal && !currentUser.premium?.isActive) {
      if (rejectInflight) rejectInflight(new Error('forbidden'));
      if (inflightCacheKey) inflight.delete(inflightCacheKey);
      return res.status(403).json({ success: false, message: 'Global discovery is a Premium feature' });
    }

    let searchLat = lat ? parseFloat(lat) : null;
    let searchLng = lng ? parseFloat(lng) : null;

    let isPassportOrTravel = false;

    if (currentUser.premium?.isActive && currentUser.passportLocation?.isActive && currentUser.passportLocation?.coordinates?.length >= 2) {
      searchLng = currentUser.passportLocation.coordinates[0];
      searchLat = currentUser.passportLocation.coordinates[1];
      isPassportOrTravel = true;
    }
    else if (currentUser.premium?.isActive && currentUser.activeLocationId) {
      const activeLoc = (currentUser.additionalLocations || []).find(
        l => l._id.toString() === currentUser.activeLocationId.toString()
      );
      if (activeLoc?.lat && activeLoc?.lng) {
        searchLat = activeLoc.lat;
        searchLng = activeLoc.lng;
        isPassportOrTravel = true;
        logger.log(`[DISCOVERY] Using saved location: ${activeLoc.city || activeLoc.name} (${activeLoc.lat}, ${activeLoc.lng})`);
      }
    }

    const blockedUserIds = currentUser.blockedUsers || [];

    // Run the blocked-by lookup and active-match lookup in parallel.
    // Previously sequential (~100 ms each); now one round-trip.
    const Match = require('../models/Match');
    const [usersWhoBlockedMe, matches] = await Promise.all([
      User.find({ blockedUsers: req.user.id }).select('_id'),
      Match.find({ users: req.user.id, status: 'active' }),
    ]);

    const blockedByIds = usersWhoBlockedMe.map(u => u._id);
    const matchedUserIds = matches.flatMap(m => m.users.map(u => u.toString())).filter(id => id !== req.user.id.toString());

    let excludedIds = [
      ...blockedUserIds.map(id => id.toString()),
      ...blockedByIds.map(id => id.toString()),
      req.user.id.toString(),
      ...(currentUser.swipedRight || []).map(id => id.toString()),
      ...(currentUser.swipedLeft || []).map(id => id.toString()),
      ...matchedUserIds,
    ];

    // NOTE: We deliberately do NOT exclude users with pending FriendRequests
    // any more. Previously this hid two groups from Discovery:
    //   1. Users I already liked (request where I'm the sender) — already
    //      excluded via swipedRight above, so this was redundant.
    //   2. Users who liked ME but I haven't responded to yet (request where
    //      I'm the receiver) — these were being silently hidden, which is
    //      why people reported "users show on Radar but never appear on
    //      Discovery." Showing them on Discovery lets the swipe trigger an
    //      instant Match (their pending request becomes the mutual right-
    //      swipe in the /swipe handler).
    // Now Discovery and Radar use the same exclusion set: blocked, blocked-by,
    // already-swiped (left or right), and active matches.

    excludedIds = [...new Set(excludedIds)];

    const query = {
      _id: { $nin: excludedIds },
      banned: { $ne: true },
      suspended: { $ne: true },
    };

    const wantVerifiedOnly =
      currentUser.premium?.isActive && (verifiedOnly === 'true' || currentUser.preferences?.showVerifiedOnly === true);
    if (wantVerifiedOnly) query.verified = true;

    const wantOnlineOnly =
      onlineOnly === 'true' || currentUser.preferences?.onlineNow === true;
    if (wantOnlineOnly) query.onlineStatus = 'online';

    const minAgeFilter = minAge ? parseInt(minAge, 10) : (currentUser.preferences?.ageRange?.min || 18);
    const maxAgeFilter = maxAge ? parseInt(maxAge, 10) : (currentUser.preferences?.ageRange?.max || 100);
    query.age = { $gte: Number(minAgeFilter), $lte: Number(maxAgeFilter) };

    const resolvedGenders = genders || currentUser.preferences?.genderPreference;
    if (resolvedGenders && resolvedGenders !== 'both' && resolvedGenders !== 'any') {
      const genderArray = resolvedGenders.split(',').map(g => g.trim().toLowerCase());
      const expandedGenders = [];
      genderArray.forEach(g => {
        expandedGenders.push(g);
        if (g === 'male') expandedGenders.push('man');
        else if (g === 'man') expandedGenders.push('male');
        else if (g === 'female') expandedGenders.push('woman');
        else if (g === 'woman') expandedGenders.push('female');
      });
      query.gender = { $in: [...new Set(expandedGenders)] };
    }

    const resolvedLookingFor = lookingFor || null;
    if (resolvedLookingFor) query.lookingFor = resolvedLookingFor;

    const resolvedReligion = religion || null;
    if (resolvedReligion && resolvedReligion !== 'any') {
      query['lifestyle.religion'] = resolvedReligion;
    }

    const resolvedSmoking = smoking || null;
    if (resolvedSmoking && resolvedSmoking !== 'any') {
      query['lifestyle.smoking'] = resolvedSmoking;
    }

    const resolvedDrinking = drinking || null;
    if (resolvedDrinking && resolvedDrinking !== 'any') {
      query['lifestyle.drinking'] = resolvedDrinking;
    }

    if (wantsKids != null && wantsKids !== 'any') {
      query['lifestyle.wantsKids'] = wantsKids === 'true';
    }

    const isPremium = currentUser.premium?.isActive;
    // Free users are capped at 50km. Premium users (or those using a
    // passport / saved location / Global discovery) can go further. Kept
    // in sync with the same cap enforced on the radar feed below.
    const FREE_MAX_DISTANCE_KM = 50;

    const rawMaxDist = normaliseMaxDistanceKm(
      maxDistance ? parseInt(maxDistance, 10) : currentUser.preferences?.maxDistance,
      FREE_MAX_DISTANCE_KM
    );
    const maxDist = (isPremium || isGlobal || isPassportOrTravel) ? rawMaxDist : Math.min(rawMaxDist, FREE_MAX_DISTANCE_KM);

    let effectiveLat = searchLat || (lat ? parseFloat(lat) : null);
    let effectiveLng = searchLng || (lng ? parseFloat(lng) : null);

    // Fall back to the user's stored profile coordinates if the client didn't
    // send them on this request (e.g. silent radar refresh).
    if (effectiveLat == null || effectiveLng == null) {
      const stored = currentUser?.location;
      const storedLat = stored?.coordinates?.[1] ?? stored?.lat ?? null;
      const storedLng = stored?.coordinates?.[0] ?? stored?.lng ?? null;
      if (storedLat != null && storedLng != null) {
        effectiveLat = storedLat;
        effectiveLng = storedLng;
      }
    }

    // Treat the exact [0, 0] coordinate pair as "no location" — it is the
    // Mongoose default written to every new user document before they share
    // GPS. Searching from [0, 0] targets the Gulf of Guinea and returns zero
    // real users, while Number.isFinite(0) would otherwise pass the guard
    // below and silently serve an empty deck with no error shown.
    if (effectiveLat === 0 && effectiveLng === 0) {
      effectiveLat = null;
      effectiveLng = null;
    }

    const hasOrigin = effectiveLat != null && effectiveLng != null;

    // Gate: a user who is not using Global discovery and has no usable origin
    // (no GPS in this request, no stored profile coords, no active passport/saved
    // location) must enable location before they can browse. Returning an empty
    // result with `requiresLocation:true` lets the client show a clear prompt
    // instead of silently leaking unfiltered users.
    if (!isGlobal && !hasOrigin) {
      if (resolveInflight) resolveInflight({ users: [], nextCursor: null, requiresLocation: true });
      if (inflightCacheKey) {
        const inflight = req.app.get('discoveryInflight');
        if (inflight) inflight.delete(inflightCacheKey);
      }
      return res.json({
        success: true,
        users: [],
        nextCursor: null,
        requiresLocation: true,
        message: 'Enable location to discover people near you, or switch to Global (Premium) to browse by country.',
      });
    }

    if (isGlobal) {
      if (countryFilter) {
        // Some countries have multiple accepted names (e.g. Turkey / Türkiye,
        // Czech Republic / Czechia, Ivory Coast / Côte d'Ivoire). Different
        // geocoding providers and different app versions store different
        // variants. Build a list of all known aliases and match any of them
        // so a user selecting "Turkey" sees profiles stored as "Türkiye" too.
        const COUNTRY_ALIASES = {
          'turkey':          ['Turkey', 'Türkiye'],
          'türkiye':         ['Turkey', 'Türkiye'],
          'czech republic':  ['Czech Republic', 'Czechia'],
          'czechia':         ['Czech Republic', 'Czechia'],
          'ivory coast':     ['Ivory Coast', "Côte d'Ivoire", "Cote d'Ivoire"],
          "côte d'ivoire":   ['Ivory Coast', "Côte d'Ivoire", "Cote d'Ivoire"],
          "cote d'ivoire":   ['Ivory Coast', "Côte d'Ivoire", "Cote d'Ivoire"],
          'cape verde':      ['Cape Verde', 'Cabo Verde'],
          'cabo verde':      ['Cape Verde', 'Cabo Verde'],
          'north macedonia': ['North Macedonia', 'Macedonia'],
          'macedonia':       ['North Macedonia', 'Macedonia'],
          'myanmar':         ['Myanmar', 'Burma'],
          'burma':           ['Myanmar', 'Burma'],
          'eswatini':        ['Eswatini', 'Swaziland'],
          'swaziland':       ['Eswatini', 'Swaziland'],
          'dr congo':        ['DR Congo', 'Democratic Republic of Congo', 'DRC'],
          'democratic republic of congo': ['DR Congo', 'Democratic Republic of Congo', 'DRC'],
          'drc':             ['DR Congo', 'Democratic Republic of Congo', 'DRC'],
          'congo':           ['Congo', 'Republic of Congo'],
        };
        const key = countryFilter.trim().toLowerCase();
        const aliases = COUNTRY_ALIASES[key] || [countryFilter];
        const escaped = aliases.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const countryRegexes = escaped.map(e => new RegExp(`^${e}$`, 'i'));
        // Match users whose country appears in EITHER their profile location
        // OR their live location. autoUpdateProfileLocation defaults to false,
        // so many users only have the country in liveLocation (the GPS-ping
        // field) and would be invisible if we only checked location.country.
        query.$or = [
          { 'location.country':     { $in: countryRegexes } },
          { 'liveLocation.country': { $in: countryRegexes } },
        ];
      }
    } else if (hasOrigin) {
      // Use the 2dsphere index when origin coordinates are available.
      // Query the top-level `location` field (GeoJSON Point) so MongoDB uses
      // the 2dsphere index defined on `location`. Querying the sub-field
      // `location.coordinates` directly bypasses that index.
      const radiusKm = Math.max(1, Math.min(maxDist * 2, 20000));
      const radiusInRadians = radiusKm / 6371;
      query.location = {
        $geoWithin: { $centerSphere: [[effectiveLng, effectiveLat], radiusInRadians] }
      };
      // Exclude users whose coordinates are still the Mongoose default [0, 0]
      // (i.e. they are in the Gulf of Guinea). The $geoWithin above would
      // only include them when the search origin is also [0, 0] — which we
      // now prevent — but adding an explicit $ne here means they can never
      // leak into any results, even under edge-case coordinate rounding.
      query['location.coordinates'] = { $ne: [0, 0] };
    }

    // ─── DIAGNOSTIC BLOCK — shows every variable that influences what the
    //     DB query sees.  Do NOT remove until the root cause is confirmed. ───
    const radiusKmForLog  = hasOrigin && !isGlobal
      ? Math.max(1, Math.min(maxDist * 2, 20000))
      : null;
    const radiusRadForLog = radiusKmForLog != null ? (radiusKmForLog / 6371) : null;
    logger.log('[DISCOVERY:DIAG] ── request params ──');
    logger.log('[DISCOVERY:DIAG]   raw lat/lng from client:', lat, lng);
    logger.log('[DISCOVERY:DIAG]   effectiveLat:', effectiveLat, '  effectiveLng:', effectiveLng);
    logger.log('[DISCOVERY:DIAG]   hasOrigin:', hasOrigin);
    logger.log('[DISCOVERY:DIAG]   isGlobal:', isGlobal, '  isPassportOrTravel:', isPassportOrTravel);
    logger.log('[DISCOVERY:DIAG]   maxDist (km, after cap):', maxDist);
    logger.log('[DISCOVERY:DIAG]   radiusKm sent to $geoWithin:', radiusKmForLog, '(= maxDist * 2)');
    logger.log('[DISCOVERY:DIAG]   radiusInRadians:', radiusRadForLog);
    logger.log('[DISCOVERY:DIAG]   ageRange:', [minAgeFilter, maxAgeFilter]);
    logger.log('[DISCOVERY:DIAG]   gender filter:', JSON.stringify(query.gender ?? 'ANY'));
    logger.log('[DISCOVERY:DIAG]   onlineOnly:', wantOnlineOnly, '  verifiedOnly:', wantVerifiedOnly);
    logger.log('[DISCOVERY:DIAG]   excludedIds count:', excludedIds.length);
    if (hasOrigin && !isGlobal) {
      logger.log('[DISCOVERY:DIAG]   geoWithin query:', JSON.stringify(query.$or?.[0]));
      logger.log('[DISCOVERY:DIAG]   secondOrBranch:', JSON.stringify(query.$or?.[1]));
    }
    logger.log('[DISCOVERY:DIAG]   full mongo query (no $or):', JSON.stringify({
      ...query,
      $or: undefined,
      _id: '<excluded list>'
    }));
    // ── end diagnostic block ──

    const queryStart = Date.now();
    let users = await User.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpire -verificationOTP -verificationOTPExpire -pushToken -pushTokenUpdatedAt -fcmToken -fcmTokenUpdatedAt -voipPushToken -liveLocation')
      .limit(200);
    const queryMs = Date.now() - queryStart;
    logger.log(`[DISCOVERY:DIAG] DB returned ${users.length} users BEFORE distance post-filter (queryMs=${queryMs})`);
    if (users.length === 0) {
      logger.log('[DISCOVERY:DIAG]   ↑ DB returned 0 — if effectiveLat/Lng are 0,0 that is the bug (Gulf of Guinea search)');
    } else {
      const sample = users.slice(0, 3).map(u => ({
        id: u._id,
        name: u.name,
        coords: u.location?.coordinates,
        locType: u.location?.type,
      }));
      logger.log('[DISCOVERY:DIAG]   sample users from DB:', JSON.stringify(sample));
    }

    users = users.map(user => {
      const userObj = user.toObject();

      const distanceKm = distanceToUser(effectiveLat, effectiveLng, user.location);

      const { total: score, breakdown } = calculateMatchScore(
        userObj,
        currentUser,
        isGlobal ? null : distanceKm,
        maxDist
      );

      return { ...userObj, score, scoreBreakdown: breakdown, distance: distanceKm };
    });

    if (!isGlobal && !isPassportOrTravel && hasOrigin) {
      const beforeFilter = users.length;
      // Require a real computed distance; users whose distance is null have
      // invalid/default coordinates ([0,0]) and must not appear in local results.
      users = users.filter(u => u.distance != null && u.distance <= maxDist);
      logger.log(`[DISCOVERY:DIAG] after distance post-filter: ${users.length} (removed ${beforeFilter - users.length} — distance > ${maxDist}km or null)`);
    }

    // Apply boost multiplier to scores so boosted profiles surface first
    let boostMap = new Map();
    try {
      boostMap = await Boost.getBoostedUserIds();
    } catch (boostErr) {
      logger.warn('[DISCOVERY] Failed to fetch boost map (non-fatal):', boostErr);
    }

    users = users.map(u => {
      const multiplier = boostMap.get(u._id.toString());
      return multiplier ? { ...u, score: u.score * multiplier, boosted: true } : u;
    });

    users.sort((a, b) => b.score - a.score);

    const offset = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
    const totalAvailable = users.length;
    users = users.slice(offset, offset + limit);
    const nextCursor = offset + limit < totalAvailable ? String(offset + limit) : null;

    // Track viewsGained for any boosted users that appear in this page (fire-and-forget)
    const boostedInPage = users.filter(u => u.boosted).map(u => u._id.toString());
    if (boostedInPage.length > 0) {
      setImmediate(async () => {
        try {
          for (const uid of boostedInPage) {
            const activeBoost = await Boost.getActiveBoost(uid);
            if (activeBoost) await activeBoost.incrementStat('viewsGained');
          }
        } catch (e) {
          logger.warn('[DISCOVERY] Boost stat increment failed (non-fatal):', e);
        }
      });
    }

    // Premium-only feature: free users see only a coarse distance bucket
    // (e.g. "< 5 km", "5–15 km") rather than the exact figure, matching the
    // frontend's "Upgrade to see exact distance" copy. Without this, a
    // technically-savvy user could read the precise km value out of the raw
    // API response even though the UI hides it.
    const isPremiumViewer = !!req.user.premium?.isActive;
    const bucketDistance = (km) => {
      if (km == null || isNaN(km)) return null;
      if (km < 5)  return { bucket: '< 5 km',   max: 5   };
      if (km < 15) return { bucket: '5–15 km',  max: 15  };
      if (km < 50) return { bucket: '15–50 km', max: 50  };
      return                 { bucket: '50+ km',  max: 100 };
    };

    users = users.map(user => {
      const privacy = user.privacySettings || {};
      const isOnline = user.onlineStatus === 'online' || user.online;

      const visiblePhotos = (user.photos || []).filter(p => !p.privacy || p.privacy === 'public');

      // eslint-disable-next-line no-unused-vars
      const { scoreBreakdown, distance: rawDistance, ...userWithoutBreakdown } = user;
      const distancePayload = isPremiumViewer
        ? rawDistance
        : bucketDistance(rawDistance)?.max ?? null;
      const distanceLabel = isPremiumViewer
        ? null
        : bucketDistance(rawDistance)?.bucket ?? null;

      return {
        ...userWithoutBreakdown,
        distance: distancePayload,
        distanceLabel,
        photos: visiblePhotos,
        age: privacy.hideAge ? null : user.age,
        online: privacy.showOnlineStatus === false ? null : isOnline,
        onlineStatus: privacy.showOnlineStatus === false ? null : user.onlineStatus,
        lastActive: privacy.showLastActive === false ? null : user.lastActive,
      };
    });

    const totalMs = Date.now() - queryStart;
    logger.log(`[DISCOVERY] Returning ${users.length}/${totalAvailable} users (global=${isGlobal}, country=${countryFilter || 'all'}, maxDist=${maxDist}km, premium=${!!isPremium}, queryMs=${queryMs}, totalMs=${totalMs}, offset=${offset})`);

    const payload = { users, nextCursor };
    // Don't lock in an empty result for the full TTL — the deck could fill up
    // within seconds if a nearby user comes online or updates their location.
    // Cache non-empty pages for 10 min; empty pages get 60 s so the client
    // retries quickly without hammering the DB on every swipe.
    const cacheTtl = users.length > 0 ? 600 : 60;
    await redis.set(cacheKey, payload, cacheTtl);

    if (resolveInflight) resolveInflight(payload);
    if (inflightCacheKey) {
      const inflight = req.app.get('discoveryInflight');
      if (inflight) inflight.delete(inflightCacheKey);
    }

    res.json({
      success: true,
      users,
      nextCursor
    });
  } catch (error) {
    logger.error('Nearby users error:', error);
    if (rejectInflight) rejectInflight(error);
    if (inflightCacheKey) {
      const inflight = req.app.get('discoveryInflight');
      if (inflight) inflight.delete(inflightCacheKey);
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/profile-views', protect, async (req, res) => {
  try {
    const isPremium = req.user.premium?.isActive;
    if (!isPremium) {
      return res.status(403).json({ success: false, message: 'Who viewed me is a Premium feature' });
    }

    const cacheKey = `profileviews:${req.user._id}`;
    const cachedViews = await redis.get(cacheKey);
    if (cachedViews) return res.json({ success: true, views: cachedViews, fromCache: true });

    const user = await User.findById(req.user._id)
      .populate('profileViews.user', 'name username photos age gender');
    
    const uniqueViews = [];
    const seenUsers = new Set();
    
    [...user.profileViews].reverse().forEach(view => {
      if (view.user && !seenUsers.has(view.user._id.toString())) {
        uniqueViews.push(view);
        seenUsers.add(view.user._id.toString());
      }
    });

    await redis.set(cacheKey, uniqueViews, 60);
    res.json({
      success: true,
      views: uniqueViews
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/who-viewed-me', protect, async (req, res) => {
  try {
    const isPremium = req.user.premium?.isActive;
    const cacheKey = `whoviewedme:${req.user._id}:${isPremium ? 'premium' : 'free'}`;
    const cachedWVM = await redis.get(cacheKey);
    if (cachedWVM) return res.json({ success: true, ...cachedWVM, fromCache: true });

    const user = await User.findById(req.user._id)
      .populate('profileViews.user', 'name username photos age gender verified');
    
    if (!user.profileViews || user.profileViews.length === 0) {
      return res.json({ success: true, views: [], isPremium });
    }
    
    const uniqueViews = [];
    const seenUsers = new Set();
    
    [...user.profileViews].reverse().forEach(view => {
      if (view.user && !seenUsers.has(view.user._id.toString())) {
        uniqueViews.push(view);
        seenUsers.add(view.user._id.toString());
      }
    });

    const processedViews = uniqueViews.map(view => {
      const viewData = {
        _id: view.user._id,
        name: view.user.name,
        age: view.user.age,
        gender: view.user.gender,
        verified: view.user.verified,
        viewedAt: view.viewedAt
      };
      
      if (isPremium) {
        viewData.photos = view.user.photos;
        viewData.canInteract = true;
      } else {
        viewData.photos = [];
        viewData.isBlurred = true;
        viewData.canInteract = false;
      }
      
      return viewData;
    });

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyViews = (user.profileViews || []).filter(v => new Date(v.viewedAt) >= oneWeekAgo);
    const weeklyViewCount = new Set(weeklyViews.map(v => v.user?._id?.toString()).filter(Boolean)).size;

    const FriendRequest = require('../models/FriendRequest');
    const almostLiked = await FriendRequest.countDocuments({
      receiver: req.user._id,
      status: 'pending',
      createdAt: { $gte: oneWeekAgo }
    });

    const wvmPayload = {
      views: processedViews,
      isPremium,
      totalCount: processedViews.length,
      weeklyInsights: {
        viewsThisWeek: weeklyViewCount,
        almostLikedYou: almostLiked
      }
    };
    await redis.set(cacheKey, wvmPayload, 60);
    res.json({ success: true, ...wvmPayload });
  } catch (error) {
    logger.error('Who viewed me error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    if (!req.user.emailVerified) {
      return res.status(403).json({ success: false, message: 'Please verify your email first' });
    }

    const isOwnProfileCheck = req.user._id.toString() === req.params.id;
    const cacheKey = `profile:${req.params.id}:viewer:${req.user._id}`;
    if (!isOwnProfileCheck) {
      const cachedProfile = await redis.get(cacheKey);
      if (cachedProfile) return res.json({ success: true, user: cachedProfile, fromCache: true });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const { password, resetPasswordToken, resetPasswordExpire, verificationOTP, verificationOTPExpire, ...otherUserInfo } = user.toObject();

    if (req.user._id.toString() !== req.params.id) {
      delete otherUserInfo.email;
      delete otherUserInfo.resetPasswordOTP;
      delete otherUserInfo.resetPasswordOTPExpire;
      delete otherUserInfo.banned;
      delete otherUserInfo.banReason;
      delete otherUserInfo.bannedAt;
      delete otherUserInfo.appeal;
      delete otherUserInfo.suspended;
      delete otherUserInfo.suspendedUntil;
      delete otherUserInfo.tokenVersion;
      delete otherUserInfo.verificationOTP;
      delete otherUserInfo.verificationOTPExpire;
      // Push tokens must NEVER be visible to other users — they are device
      // credentials that could be used to send direct FCM/APNs messages to
      // the victim's device. liveLocation (precise GPS) is also stripped;
      // approximate distance is served separately through the discovery API.
      delete otherUserInfo.pushToken;
      delete otherUserInfo.pushTokenUpdatedAt;
      delete otherUserInfo.fcmToken;
      delete otherUserInfo.fcmTokenUpdatedAt;
      delete otherUserInfo.voipPushToken;
      delete otherUserInfo.liveLocation;
    }

    if (req.user._id.toString() !== req.params.id) {
      const viewerIncognito = req.user.privacySettings?.incognitoMode === true;
      if (!viewerIncognito) {
        await User.findByIdAndUpdate(req.params.id, {
          $push: {
            profileViews: {
              user: req.user._id,
              viewedAt: new Date()
            }
          }
        });
      }
    }

    const isPremium = req.user.premium?.isActive;
    const privacy = user.privacySettings || {};

    if (privacy.hideAge) otherUserInfo.age = null;
    if (privacy.showOnlineStatus === false) {
      otherUserInfo.online = null;
      otherUserInfo.onlineStatus = null;
    }

    if (!isPremium && (privacy.showDistance === false || !isPremium)) {
      otherUserInfo.distance = null;
    }

    if (privacy.showLastActive === false) otherUserInfo.lastActive = null;

    const Match = require('../models/Match');
    const isMatched = await Match.exists({
      users: { $all: [req.user._id, user._id] },
      status: 'active'
    });
    const isOwnProfile = req.user._id.toString() === req.params.id;

    otherUserInfo.photos = (otherUserInfo.photos || []).filter(photo => {
      if (!photo.privacy || photo.privacy === 'public') return true;
      if (photo.privacy === 'friends') return isOwnProfile || isMatched;
      if (photo.privacy === 'private') return isOwnProfile;
      return false;
    });

    if (!isOwnProfileCheck) {
      await redis.set(cacheKey, otherUserInfo, 120);
    }
    res.json({ success: true, user: otherUserInfo });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/photos/:photoIndex', protect, async (req, res) => {
  try {
    const { photoIndex } = req.params;
    const index = parseInt(photoIndex);
    
    const user = await User.findById(req.user._id);
    if (!user || !user.photos) {
      return res.status(400).json({ success: false, message: 'No photos to delete' });
    }
    
    if (index < 0 || index >= user.photos.length) {
      return res.status(400).json({ success: false, message: 'Invalid photo index' });
    }
    
    if (user.photos.length <= 4) {
      return res.status(400).json({ success: false, message: 'You need at least 4 photos on your profile. Add more before deleting this one.' });
    }
    
    user.photos.splice(index, 1);
    
    if (user.photos.length > 0) {
      user.photos = user.photos.map((photo, idx) => ({
        ...photo,
        isPrimary: idx === 0,
        order: idx
      }));
    }
    
    await user.save();
    
    res.json({ success: true, message: 'Photo deleted successfully', photos: user.photos });
  } catch (error) {
    logger.error('Delete photo error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/me', protect, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/me/live-location', protect, async (req, res) => {
  try {
    const { lat, latitude, lng, longitude, accuracy, city, country } = req.body || {};
    const numericLat = Number(lat ?? latitude);
    const numericLng = Number(lng ?? longitude);

    if (
      !Number.isFinite(numericLat) || !Number.isFinite(numericLng) ||
      numericLat < -90 || numericLat > 90 ||
      numericLng < -180 || numericLng > 180
    ) {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.locationSharingEnabled === false) {
      return res.status(403).json({ success: false, message: 'Location sharing is disabled' });
    }

    const resolvedCity = city || user.liveLocation?.city;
    const resolvedCountry = country || user.liveLocation?.country;

    user.liveLocation = {
      type: 'Point',
      coordinates: [numericLng, numericLat],
      city: resolvedCity,
      country: resolvedCountry,
      accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : undefined
    };
    user.liveLocationUpdatedAt = new Date();

    let profileLocationUpdated = false;
    if (user.autoUpdateProfileLocation) {
      user.location = {
        type: 'Point',
        coordinates: [numericLng, numericLat],
        city: resolvedCity || user.location?.city,
        country: resolvedCountry || user.location?.country
      };
      user.locationUpdatedAt = new Date();
      if (resolvedCity || resolvedCountry) {
        user.livingIn = [resolvedCity, resolvedCountry].filter(Boolean).join(', ');
      }
      profileLocationUpdated = true;
    }

    await user.save();

    // Invalidate location caches — country may have changed.
    await invalidateLocationCaches(user._id);

    // Fire-and-forget: notify any nearby users whose discovery stack is
    // exhausted so the new/returning user appears in their deck right away.
    const freshUser = await User.findById(user._id).lean();
    const io = req.app.get('io');
    notifyExhaustedUsersOfNewMember(freshUser, io).catch(() => {});

    res.json({
      success: true,
      liveLocation: user.liveLocation,
      liveLocationUpdatedAt: user.liveLocationUpdatedAt,
      profileLocationUpdated,
      livingIn: user.livingIn,
      location: user.location
    });
  } catch (error) {
    logger.error('Update live location error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/me/locations', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user.premium?.isActive) {
      return res.status(403).json({ success: false, message: 'Premium required for additional locations' });
    }
    if (!user.additionalLocations) user.additionalLocations = [];
    if (user.additionalLocations.length >= 3) {
      return res.status(400).json({ success: false, message: 'Maximum 3 additional locations reached' });
    }

    const { name } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'Location name is required' });
    }

    let lat = null, lng = null, city = '', country = '';
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`;
      const geoRes = await fetch(geoUrl, { headers: { 'User-Agent': 'Emorii/1.0' } });
      const geoData = await geoRes.json();
      if (geoData && geoData.length > 0) {
        lat = parseFloat(geoData[0].lat);
        lng = parseFloat(geoData[0].lon);
        const display = geoData[0].display_name?.split(',') || [];
        city = display[0]?.trim() || name;
        country = display[display.length - 1]?.trim() || '';
      }
    } catch (geoErr) {
      logger.warn('Geocoding failed for location:', name, geoErr.message);
    }

    user.additionalLocations.push({ name: name.trim(), lat, lng, city, country });
    await user.save();
    // A new country may have appeared — bust the countries list cache.
    await invalidateLocationCaches(req.user.id);
    res.json({ success: true, locations: user.additionalLocations });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/me/locations/active', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const { locationId } = req.body;

    if (!locationId) {
      user.activeLocationId = null;
      await user.save();
      return res.json({ success: true, message: 'Reverted to GPS location', activeLocationId: null });
    }

    const loc = (user.additionalLocations || []).find(l => l._id.toString() === locationId);
    if (!loc) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    if (!loc.lat || !loc.lng) {
      return res.status(400).json({ success: false, message: 'This location could not be geocoded. Please try a more specific name.' });
    }

    user.activeLocationId = loc._id;
    await user.save();
    res.json({ success: true, message: `Discovery set to ${loc.city || loc.name}`, activeLocationId: loc._id, location: loc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/passport-location', protect, async (req, res) => {
  try {
    if (!req.user.premium?.isActive) {
      return res.status(403).json({ success: false, message: 'Passport is a Premium feature!' });
    }
    const { lat, lng, city, country, isActive } = req.body;
    const user = await User.findById(req.user._id);
    if (isActive === false) {
      user.passportLocation = { isActive: false };
      await user.save();
      return res.json({ success: true, message: 'Passport location cleared' });
    }
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Location required' });
    }
    user.passportLocation = {
      type: 'Point',
      coordinates: [parseFloat(lng), parseFloat(lat)],
      city: city || '',
      country: country || '',
      isActive: true
    };
    await user.save();
    // Passport changes the effective country for discovery — clear caches.
    await invalidateLocationCaches(req.user._id);
    res.json({ success: true, message: `Passport set to ${city || 'selected location'}`, passportLocation: user.passportLocation });
  } catch (error) {
    logger.error('Passport location error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/me/locations/:locationId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.activeLocationId?.toString() === req.params.locationId) {
      user.activeLocationId = null;
    }
    user.additionalLocations = (user.additionalLocations || []).filter(
      loc => loc._id.toString() !== req.params.locationId
    );
    await user.save();
    res.json({ success: true, locations: user.additionalLocations, activeLocationId: user.activeLocationId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/me/translation-settings', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('preferences.language preferences.autoTranslate')
      .lean();
    res.json({
      success: true,
      autoTranslate: user?.preferences?.autoTranslate || false,
      preferredLanguage: user?.preferences?.language || 'en',
    });
  } catch (err) {
    logger.error('translation-settings GET error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/me/translation-settings', protect, async (req, res) => {
  try {
    const { autoTranslate, preferredLanguage } = req.body;
    const update = {};
    if (typeof autoTranslate === 'boolean') {
      update['preferences.autoTranslate'] = autoTranslate;
    }
    if (preferredLanguage && typeof preferredLanguage === 'string') {
      update['preferences.language'] = preferredLanguage.toLowerCase().substring(0, 10);
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }
    await User.findByIdAndUpdate(req.user.id, { $set: update });
    await redis.del(`profile:me:${req.user.id}`);
    res.json({ success: true });
  } catch (err) {
    logger.error('translation-settings PUT error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;