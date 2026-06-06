const logger = require('../utils/logger');
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const redis = require('../utils/redis');
const { haversineDistance, extractLatLng } = require('../utils/distance');
const { discoveryLimiter } = require('../middleware/rateLimiter');

function formatDistance(distanceKm) {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return { value: meters, unit: 'm', display: `${meters}m` };
  } else if (distanceKm < 10) {
    return { value: Math.round(distanceKm * 10) / 10, unit: 'km', display: `${(Math.round(distanceKm * 10) / 10).toFixed(1)}km` };
  } else {
    return { value: Math.round(distanceKm), unit: 'km', display: `${Math.round(distanceKm)}km` };
  }
}

function addPrivacyOffset(distance) {
  if (distance < 0.5) {
    return Math.max(0.1, distance + (Math.random() * 0.1));
  }
  const jitter = (Math.random() - 0.5) * 0.1;
  return Math.max(0.1, distance + (distance * jitter));
}

function generateRandomAngle() {
  return Math.random() * 360;
}

router.get('/nearby-users', protect, discoveryLimiter, async (req, res) => {
  try {
    const { lat, lng, radius = 10, gender, ageMin, ageMax } = req.query;

    if (!req.user.emailVerified) {
      return res.status(403).json({ 
        success: false, 
        message: 'Please verify your email first' 
      });
    }

    if (!lat || !lng) {
      return res.status(400).json({ 
        success: false, 
        message: 'Location coordinates (lat, lng) are required' 
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const cacheKey = `radar:${req.user._id}:${Math.round(latitude * 100)}:${Math.round(longitude * 100)}:${radius}:${gender || 'any'}:${ageMin || ''}:${ageMax || ''}`;
    const cachedRadar = await redis.get(cacheKey);
    if (cachedRadar) return res.json({ success: true, ...cachedRadar, fromCache: true });
    let searchRadius = parseInt(radius);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid coordinates' 
      });
    }

    // Free users are capped at 50km on radar (matches the discovery deck cap
    // in `/users/nearby`). Premium users can scan up to 100km.
    const radarUser = await User.findById(req.user.id).select('premium');
    const isPremiumRadar = !!radarUser?.premium?.isActive;
    const radarMaxKm = isPremiumRadar ? 100 : 50;
    searchRadius = Math.max(1, Math.min(radarMaxKm, searchRadius));

    const currentUser = await User.findById(req.user.id).select('swipedRight swipedLeft blockedUsers');
    const blockedUserIds = currentUser?.blockedUsers || [];
    const usersWhoBlockedMe = await User.find({ blockedUsers: req.user.id }).select('_id');
    const blockedByIds = usersWhoBlockedMe.map(u => u._id);

    const Match = require('../models/Match');
    const matches = await Match.find({ users: req.user.id, status: 'active' });
    const matchedUserIds = matches.flatMap(m => m.users.map(u => u.toString())).filter(id => id !== req.user.id.toString());

    const FriendRequest = require('../models/FriendRequest');
    const pendingRequests = await FriendRequest.find({
      $or: [
        { sender: req.user._id, status: 'pending' },
        { receiver: req.user._id, status: 'pending' }
      ]
    }).select('sender receiver');
    const pendingIds = pendingRequests.map(r => {
      const sid = r.sender.toString();
      const rid = r.receiver.toString();
      return sid === req.user._id.toString() ? rid : sid;
    });

    const excludedIds = [
      ...blockedUserIds.map(id => id.toString()),
      ...blockedByIds.map(id => id.toString()),
      req.user.id.toString(),
      ...(currentUser?.swipedRight || []).map(id => id.toString()),
      ...(currentUser?.swipedLeft || []).map(id => id.toString()),
      ...matchedUserIds,
      ...pendingIds
    ].filter((id, idx, arr) => arr.indexOf(id) === idx);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const query = {
      _id: { $ne: req.user.id, $nin: excludedIds },
      banned: { $ne: true },
      suspended: { $ne: true },
      // Users with Incognito Mode on must not appear on the radar feed.
      'privacySettings.incognitoMode': { $ne: true },
      $or: [
        { 'location.coordinates': { $exists: true, $ne: [0, 0] } },
        { 'location.lat': { $exists: true } }
      ]
    };

    if (gender && gender !== 'any' && gender !== 'both' && gender !== 'all') {
      const genderArray = gender.split(',');
      query.gender = { $in: genderArray };
    }

    if (ageMin || ageMax) {
      query.age = {};
      if (ageMin) query.age.$gte = parseInt(ageMin);
      if (ageMax) query.age.$lte = parseInt(ageMax);
    }

    const users = await User.find(query)
      .select('_id name username age gender bio photos location onlineStatus lastActive verified interests privacySettings')
      .limit(100);

    const nearbyUsers = users
      .map(user => {
        const { lat: userLat, lng: userLng } = extractLatLng(user.location);
        if (userLat == null || userLng == null) return null;

        const distance = haversineDistance(latitude, longitude, userLat, userLng);

        if (distance > searchRadius) {
          return null;
        }

        const primaryPhoto = user.photos?.find(p => p.isPrimary) || user.photos?.[0];
        const privacy = user.privacySettings || {};

        const privacyDistance = addPrivacyOffset(distance);
        const formattedDist = formatDistance(privacyDistance);
        
        return {
          id: user._id,
          name: user.name,
          username: user.username,
          age: privacy.hideAge ? null : user.age,
          gender: user.gender,
          bio: user.bio,
          profilePhoto: primaryPhoto?.url || null,
          distance: privacy.showDistance === false ? null : privacyDistance,
          distanceDisplay: privacy.showDistance === false ? null : formattedDist.display,
          distanceUnit: privacy.showDistance === false ? null : formattedDist.unit,
          angle: generateRandomAngle(),
          online: privacy.showOnlineStatus === false ? null : (user.onlineStatus === 'online'),
          lastActive: privacy.showLastActive === false ? null : user.lastActive,
          verified: user.verified,
          interests: user.interests?.slice(0, 5) || []
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.distance || 999) - (b.distance || 999))
      .slice(0, 50);

    logger.log(`[RADAR] Returning ${nearbyUsers.length} users for radius ${searchRadius}km`);
    const radarPayload = {
      users: nearbyUsers,
      count: nearbyUsers.length,
      radius: searchRadius,
      center: { lat: latitude, lng: longitude }
    };
    await redis.set(cacheKey, radarPayload, 90);
    res.json({ success: true, ...radarPayload });

  } catch (error) {
    logger.error('Radar nearby users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.patch('/location', protect, async (req, res) => {
  try {
    const { lat, lng, city, country } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Latitude and longitude are required' 
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude) || 
        latitude < -90 || latitude > 90 || 
        longitude < -180 || longitude > 180) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid coordinates' 
      });
    }

    const updateData = {
      'location.type': 'Point',
      'location.coordinates': [longitude, latitude],
      locationUpdatedAt: new Date(),
      lastActive: new Date()
    };

    if (city) updateData['location.city'] = city;
    if (country) updateData['location.country'] = country;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true }
    ).select('-password -resetPasswordToken -resetPasswordExpire -verificationOTP -verificationOTPExpire');

    // Invalidate all location-dependent caches — country may have changed.
    await Promise.all([
      redis.del('countries:list'),
      redis.delPattern('discovery:*'),
      redis.del(`profile:me:${req.user.id}`),
    ]).catch(() => {});

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: user.location,
      locationUpdatedAt: user.locationUpdatedAt
    });

  } catch (error) {
    logger.error('Update location error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.patch('/location-sharing', protect, async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: 'enabled must be a boolean value' 
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        $set: { 
          locationSharingEnabled: enabled,
          lastActive: new Date()
        } 
      },
      { new: true }
    ).select('locationSharingEnabled');

    res.json({
      success: true,
      message: enabled ? 'Location sharing enabled' : 'Location sharing disabled',
      locationSharingEnabled: user.locationSharingEnabled
    });

  } catch (error) {
    logger.error('Toggle location sharing error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

router.get('/settings', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('locationSharingEnabled location locationUpdatedAt preferences');

    const hasLocation = user.location && 
                       user.location.coordinates && 
                       user.location.coordinates.length === 2 &&
                       !(user.location.coordinates[0] === 0 && user.location.coordinates[1] === 0);

    res.json({
      success: true,
      settings: {
        locationSharingEnabled: user.locationSharingEnabled,
        hasLocation: hasLocation,
        locationCity: user.location?.city || null,
        locationCountry: user.location?.country || null,
        locationUpdatedAt: user.locationUpdatedAt,
        preferences: {
          maxDistance: user.preferences?.maxDistance || 10000,
          ageRange: user.preferences?.ageRange || { min: 18, max: 50 },
          genderPreference: user.preferences?.genderPreference || 'both'
        }
      }
    });

  } catch (error) {
    logger.error('Get radar settings error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});

module.exports = router;
