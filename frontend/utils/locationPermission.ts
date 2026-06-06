import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import logger from '@/utils/logger';

const KEY = 'location_permission_v1';

type CachedState = {
  status: 'granted' | 'denied' | 'undetermined';
  checkedAt: number;
};

let memCache: CachedState | null = null;

const TTL_MS = 24 * 60 * 60 * 1000;

async function readCache(): Promise<CachedState | null> {
  if (memCache) return memCache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedState;
    if (!parsed?.status || typeof parsed.checkedAt !== 'number') return null;
    memCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(status: CachedState['status']) {
  const next: CachedState = { status, checkedAt: Date.now() };
  memCache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    logger.error('[LOCATION_PERM] Failed to persist permission cache', err);
  }
}

/**
 * Returns the current location permission status, using a cached value when
 * possible to avoid re-prompting the user (or even re-querying the OS) every
 * time a screen mounts. The cache is invalidated:
 *   - after 24h
 *   - whenever {@link refreshPermissionStatus} is called (e.g. after the user
 *     interacts with a permission prompt or returns from Settings).
 */
export async function getCachedPermissionStatus(): Promise<CachedState['status']> {
  const cached = await readCache();
  if (cached && Date.now() - cached.checkedAt < TTL_MS) {
    return cached.status;
  }
  return refreshPermissionStatus();
}

/**
 * Force a fresh check against the OS and update the cache.
 */
export async function refreshPermissionStatus(): Promise<CachedState['status']> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    const normalized: CachedState['status'] =
      status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
    await writeCache(normalized);
    return normalized;
  } catch (err) {
    logger.error('[LOCATION_PERM] getForegroundPermissionsAsync failed', err);
    return 'undetermined';
  }
}

/**
 * Request the OS prompt and persist the resulting status. Use this only when
 * the user has explicitly tapped an "Enable Location" affordance — never on
 * silent background flows.
 */
export async function requestAndCachePermission(): Promise<CachedState['status']> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const normalized: CachedState['status'] =
      status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
    await writeCache(normalized);
    return normalized;
  } catch (err) {
    logger.error('[LOCATION_PERM] requestForegroundPermissionsAsync failed', err);
    return 'undetermined';
  }
}

/**
 * Clear the cache (e.g. on sign-out) so the next user starts fresh.
 */
export async function clearPermissionCache(): Promise<void> {
  memCache = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
