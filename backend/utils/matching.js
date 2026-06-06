/**
 * Matching Algorithm — Emorii
 *
 * calculateMatchScore(candidate, currentUser, distanceKm, maxDist)
 * Returns { total, breakdown } where total is a 0-100 normalised score.
 *
 * Score pillars (max pts each):
 *  Distance        – 30 pts  closer = higher
 *  Interests       – 25 pts  Jaccard overlap of interest arrays
 *  Recency         – 15 pts  how recently the candidate was active
 *  Profile quality – 15 pts  how complete the candidate's profile is
 *  Verified        –  5 pts  identity-verified users get a boost
 *  Online now      –  5 pts  currently online gets a bump
 *  Goal alignment  –  5 pts  same lookingFor / relationshipGoal
 *
 * Total max: 100 pts
 */

const MAX_SCORE = 100;


/**
 * Distance score (0–30).
 * Linear decay from 30 (same location) to 0 (at or beyond maxDist).
 */
function scoreDistance(distanceKm, maxDist) {
  if (distanceKm == null || maxDist <= 0) return 0;
  const ratio = Math.min(distanceKm / maxDist, 1);
  return Math.round(30 * (1 - ratio));
}

/**
 * Interest overlap score (0–25).
 * Uses Jaccard similarity: |A ∩ B| / |A ∪ B|
 */
function scoreInterests(candidateInterests = [], myInterests = []) {
  if (!candidateInterests.length || !myInterests.length) return 0;

  const mySet = new Set(myInterests.map(i => i.toLowerCase().trim()));
  const theirSet = new Set(candidateInterests.map(i => i.toLowerCase().trim()));

  let intersection = 0;
  for (const interest of theirSet) {
    if (mySet.has(interest)) intersection++;
  }

  const union = mySet.size + theirSet.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  return Math.round(25 * jaccard);
}

/**
 * Recency score (0–15).
 * Based on lastActive timestamp and current onlineStatus.
 */
function scoreRecency(lastActive, onlineStatus) {
  if (onlineStatus === 'online') return 15;

  if (!lastActive) return 0;

  const minutesAgo = (Date.now() - new Date(lastActive).getTime()) / 60000;

  if (minutesAgo < 60)    return 12; // active within the last hour
  if (minutesAgo < 1440)  return 8;  // active within the last day
  if (minutesAgo < 10080) return 4;  // active within the last week
  if (minutesAgo < 43200) return 1;  // active within the last 30 days
  return 0;
}

/**
 * Profile completeness score (0–15).
 * Rewards candidates who have invested in their profile.
 *
 * Breakdown:
 *  Photos (≥ 4)   – 4 pts
 *  Bio            – 3 pts
 *  Interests (≥3) – 3 pts
 *  Job title      – 1 pt
 *  Education      – 1 pt
 *  Zodiac sign    – 1 pt
 *  Height         – 1 pt
 *  Voice bio      – 1 pt
 */
function scoreProfileCompleteness(candidate) {
  let pts = 0;

  const photoCount = (candidate.photos || []).filter(
    p => !p.privacy || p.privacy === 'public'
  ).length;
  if (photoCount >= 4) pts += 4;
  else if (photoCount >= 2) pts += 2;
  else if (photoCount >= 1) pts += 1;

  if (candidate.bio && candidate.bio.trim().length > 20) pts += 3;
  else if (candidate.bio && candidate.bio.trim().length > 0) pts += 1;

  const interestCount = (candidate.interests || []).length;
  if (interestCount >= 3) pts += 3;
  else if (interestCount >= 1) pts += 1;

  if (candidate.jobTitle && candidate.jobTitle.trim()) pts += 1;
  if (candidate.education) pts += 1;
  if (candidate.zodiacSign) pts += 1;
  if (candidate.height) pts += 1;
  if (candidate.voiceBio) pts += 1;

  return Math.min(pts, 15);
}

/**
 * Verified boost (0–5).
 */
function scoreVerified(candidate) {
  return candidate.verified ? 5 : 0;
}

/**
 * Online now boost (0–5).
 */
function scoreOnline(candidate) {
  return candidate.onlineStatus === 'online' ? 5 : 0;
}

/**
 * Goal alignment score (0–5).
 * Rewards when both users have the same looking-for intent.
 */
function scoreGoalAlignment(candidate, currentUser) {
  const myGoal = (currentUser.lookingFor || '').toLowerCase();
  const theirGoal = (candidate.lookingFor || '').toLowerCase();

  if (!myGoal || !theirGoal) return 0;
  if (myGoal === theirGoal) return 5;

  const relaxedMatch =
    (myGoal === 'not_sure' || theirGoal === 'not_sure') ||
    (myGoal === 'relationship' && theirGoal === 'friendship') ||
    (myGoal === 'friendship' && theirGoal === 'relationship');
  return relaxedMatch ? 2 : 0;
}


/**
 * Compute a normalised 0–100 match score for a candidate relative to the
 * current user.
 *
 * @param {Object} candidate   - Candidate user object (from DB .toObject())
 * @param {Object} currentUser - The logged-in user
 * @param {number|null} distanceKm - Pre-calculated Haversine distance in km
 * @param {number} maxDist     - Active maxDistance filter in km (for decay)
 * @returns {{ total: number, breakdown: Object }}
 */
function calculateMatchScore(candidate, currentUser, distanceKm, maxDist) {
  const distance   = scoreDistance(distanceKm, maxDist);
  const interests  = scoreInterests(candidate.interests, currentUser.interests);
  const recency    = scoreRecency(candidate.lastActive, candidate.onlineStatus);
  const profile    = scoreProfileCompleteness(candidate);
  const verified   = scoreVerified(candidate);
  const online     = scoreOnline(candidate);
  const goal       = scoreGoalAlignment(candidate, currentUser);

  const raw = distance + interests + recency + profile + verified + online + goal;

  return {
    total: Math.min(Math.round(raw), MAX_SCORE),
    breakdown: {
      distance,
      interests,
      recency,
      profile,
      verified,
      online,
      goal,
    },
  };
}

module.exports = { calculateMatchScore };
