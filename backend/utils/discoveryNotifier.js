const logger = require('./logger');
const User = require('../models/User');
const { haversineDistance, extractLatLng, normaliseMaxDistanceKm } = require('./distance');

const MAX_NOTIFY_RADIUS_KM = 200;

/**
 * Called whenever a user becomes newly discoverable (location update or face
 * verification approved).  Finds every nearby user whose discovery stack is
 * currently exhausted, emits a real-time socket event so the new card appears
 * in their deck immediately, and sends an instant push notification.
 *
 * Filtering applied per-candidate before notifying:
 *  - New user's age must fall within the candidate's age-range preference.
 *  - Candidate's stored location must be within their own maxDistance
 *    preference from the new user (not just the global 200km cap).
 *
 * @param {Object} newUser  - Mongoose document or lean object of the newly discoverable user
 * @param {Object} io       - Socket.io server instance (from app.get('io'))
 */
const notifyExhaustedUsersOfNewMember = async (newUser, io) => {
  try {
    if (!newUser || !io) return;

    if (newUser.verificationStatus !== 'approved') return;
    if (newUser.banned || newUser.suspended) return;

    const privacyIncognito = newUser.privacySettings?.incognitoMode === true;
    if (privacyIncognito) return;

    const coords =
      (newUser.liveLocation?.coordinates?.[0] && newUser.liveLocation?.coordinates?.[1])
        ? newUser.liveLocation.coordinates
        : newUser.location?.coordinates;

    if (!coords || (coords[0] === 0 && coords[1] === 0)) return;

    const newUserGender = newUser.gender;
    if (!newUserGender || newUserGender === 'other') return;

    const newUserAge = newUser.age;

    // [lng, lat] in GeoJSON — extract for Haversine comparisons below
    const newUserLng = coords[0];
    const newUserLat = coords[1];

    const radiusInRadians = MAX_NOTIFY_RADIUS_KM / 6371;

    const genderMatchConditions = [
      { 'preferences.genderPreference': newUserGender },
      { 'preferences.genderPreference': 'both' },
      { 'preferences.genderPreference': 'any' },
      { 'preferences.genderPreference': { $exists: false } },
      { 'preferences.genderPreference': null },
    ];

    const candidates = await User.find({
      _id: { $ne: newUser._id },
      discoveryStackExhaustedAt: { $ne: null },
      banned: { $ne: true },
      suspended: { $ne: true },
      $or: genderMatchConditions,
      location: {
        $geoWithin: {
          $centerSphere: [[newUserLng, newUserLat], radiusInRadians],
        },
      },
      'location.coordinates': { $ne: [0, 0] },
    })
      .select('_id pushToken pushNotificationsEnabled muteSettings notificationPreferences preferences location discoveryStackExhaustedAt')
      .limit(150)
      .lean();

    if (candidates.length === 0) return;

    // Normalize new user's photos to plain URL strings
    const normalizedPhotos = (newUser.photos || []).map(p => {
      if (typeof p === 'string') return p;
      if (p && typeof p === 'object') return p.url || p.uri || null;
      return null;
    }).filter(Boolean);

    const { sendSmartNotification } = require('./pushNotifications');

    const updateIds = [];

    for (const candidate of candidates) {
      try {
        // ── Age preference filter ────────────────────────────────────────────
        // Skip if the new user's age falls outside what this candidate wants.
        const ageMin = candidate.preferences?.ageRange?.min;
        const ageMax = candidate.preferences?.ageRange?.max;
        if (newUserAge != null) {
          if (ageMin != null && newUserAge < ageMin) continue;
          if (ageMax != null && newUserAge > ageMax) continue;
        }

        // ── Per-candidate distance filter ────────────────────────────────────
        // The $geoWithin used 200km as a broad catch-all.  Now refine against
        // each candidate's own maxDistance preference so a user who only wants
        // to see people within 10km isn't notified about someone 150km away.
        const { lat: cLat, lng: cLng } = extractLatLng(candidate.location);
        let distanceKm = null;
        if (cLat != null && cLng != null) {
          distanceKm = haversineDistance(newUserLat, newUserLng, cLat, cLng);
          const candidateMaxDist = normaliseMaxDistanceKm(
            candidate.preferences?.maxDistance,
            MAX_NOTIFY_RADIUS_KM
          );
          if (distanceKm > candidateMaxDist) continue;
        }

        // ── Build the card payload for this candidate ────────────────────────
        const newUserCard = {
          _id: newUser._id,
          name: newUser.name,
          age: newUser.age,
          gender: newUser.gender,
          bio: newUser.bio,
          photos: normalizedPhotos,
          interests: newUser.interests || [],
          lookingFor: newUser.lookingFor,
          livingIn: newUser.livingIn,
          verified: newUser.verified,
          verificationStatus: newUser.verificationStatus,
          isFaceVerified: newUser.isFaceVerified,
          prompts: newUser.prompts,
          premium: newUser.premium ? { isActive: !!newUser.premium.isActive } : undefined,
          online: newUser.onlineStatus === 'online' || newUser.online || false,
          onlineStatus: newUser.onlineStatus || 'offline',
          // Computed distance from the candidate's position to the new user
          distance: distanceKm,
          location: newUser.location
            ? { city: newUser.location.city, country: newUser.location.country }
            : undefined,
        };

        io.to(candidate._id.toString()).emit('discovery:new_user', {
          user: newUserCard,
        });

        await sendSmartNotification(
          candidate,
          {
            title: 'New people are waiting for you 💫',
            body: 'Open Emorii — your discovery just got fresh!',
            data: { type: 'discovery_waiting', screen: 'Discovery' },
          },
          'system',
        );

        updateIds.push(candidate._id);
      } catch (innerErr) {
        logger.error(
          `[DiscoveryNotifier] Failed to notify user ${candidate._id}:`,
          innerErr.message,
        );
      }
    }

    if (updateIds.length > 0) {
      await User.updateMany(
        { _id: { $in: updateIds } },
        { $unset: { discoveryStackExhaustedAt: '' } },
      );
      logger.log(
        `[DiscoveryNotifier] Notified ${updateIds.length} exhausted user(s) of new member ${newUser._id}`,
      );
    }

    // ── Lightweight refresh signal to non-exhausted online users ─────────────
    // Exhausted users already received the full card above.  For users who
    // still have cards in their deck but happen to be online right now, emit a
    // cheap 'discovery:refresh' signal so their frontend queues a silent
    // background reload.  The new profile will surface naturally within their
    // next swipe session instead of waiting up to 30 s for the radar interval.
    // Capped at 200 candidates; applies the same age + distance preference
    // filters so the signal stays relevant.
    const exhaustedIdSet = new Set(updateIds.map(id => id.toString()));
    const onlineCandidates = await User.find({
      _id: { $ne: newUser._id },
      discoveryStackExhaustedAt: null,
      onlineStatus: 'online',
      banned: { $ne: true },
      suspended: { $ne: true },
      $or: genderMatchConditions,
      location: {
        $geoWithin: {
          $centerSphere: [[newUserLng, newUserLat], radiusInRadians],
        },
      },
      'location.coordinates': { $ne: [0, 0] },
    })
      .select('_id preferences location')
      .limit(200)
      .lean();

    let refreshCount = 0;
    for (const candidate of onlineCandidates) {
      // Skip any user who was already notified via discovery:new_user above
      if (exhaustedIdSet.has(candidate._id.toString())) continue;

      // Age preference filter
      const ageMin = candidate.preferences?.ageRange?.min;
      const ageMax = candidate.preferences?.ageRange?.max;
      if (newUserAge != null) {
        if (ageMin != null && newUserAge < ageMin) continue;
        if (ageMax != null && newUserAge > ageMax) continue;
      }

      // Per-candidate distance filter
      const { lat: cLat, lng: cLng } = extractLatLng(candidate.location);
      if (cLat != null && cLng != null) {
        const distKm = haversineDistance(newUserLat, newUserLng, cLat, cLng);
        const maxDist = normaliseMaxDistanceKm(
          candidate.preferences?.maxDistance,
          MAX_NOTIFY_RADIUS_KM,
        );
        if (distKm > maxDist) continue;
      }

      io.to(candidate._id.toString()).emit('discovery:refresh', {
        triggeredBy: newUser._id.toString(),
      });
      refreshCount++;
    }

    if (refreshCount > 0) {
      logger.log(
        `[DiscoveryNotifier] Sent discovery:refresh to ${refreshCount} online non-exhausted user(s) near ${newUser._id}`,
      );
    }
  } catch (err) {
    logger.error('[DiscoveryNotifier] Unexpected error:', err.message);
  }
};

module.exports = { notifyExhaustedUsersOfNewMember };
