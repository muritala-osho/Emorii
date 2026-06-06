/**
 * Haversine distance formula.
 * Returns the great-circle distance between two points in kilometres.
 *
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lon1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lon2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in km, rounded to 1 decimal place
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const toRad = deg => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(0, Number((R * c).toFixed(1)));
}

/**
 * Extract latitude and longitude from a user location object.
 * Supports GeoJSON [longitude, latitude] coordinates arrays and
 * legacy { lat, lng } flat fields.
 *
 * @param {Object|null} location
 * @returns {{ lat: number|null, lng: number|null }}
 */
function extractLatLng(location) {
  if (!location) return { lat: null, lng: null };

  const coords = location.coordinates;
  if (
    Array.isArray(coords) &&
    coords.length >= 2 &&
    !(coords[0] === 0 && coords[1] === 0)
  ) {
    return { lng: coords[0], lat: coords[1] };
  }

  if (location.lat != null && location.lng != null) {
    return { lat: Number(location.lat), lng: Number(location.lng) };
  }

  return { lat: null, lng: null };
}

/**
 * Calculate distance from a search origin to a user's location.
 * Returns null when origin or user location is unavailable.
 *
 * @param {number|null} originLat
 * @param {number|null} originLng
 * @param {Object|null} userLocation
 * @returns {number|null} Distance in km, or null
 */
function distanceToUser(originLat, originLng, userLocation) {
  if (originLat == null || originLng == null) return null;
  const { lat, lng } = extractLatLng(userLocation);
  if (lat == null || lng == null) return null;
  return haversineDistance(originLat, originLng, lat, lng);
}

/**
 * Normalise a maxDistance value that may be stored in either metres or
 * kilometres.  Values above 1000 are treated as metres and converted.
 *
 * @param {number|null|undefined} raw
 * @param {number} fallback - km value to use when raw is falsy
 * @returns {number} Distance in km
 */
function normaliseMaxDistanceKm(raw, fallback = 50) {
  if (!raw) return fallback;
  return raw > 1000 ? Math.round(raw / 1000) : raw;
}

module.exports = { haversineDistance, extractLatLng, distanceToUser, normaliseMaxDistanceKm };
