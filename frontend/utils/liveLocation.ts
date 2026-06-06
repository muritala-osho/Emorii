import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '@/constants/config';
import logger from '@/utils/logger';
import { tokenManager } from '@/utils/tokenManager';

const LAST_SENT_KEY = 'live_location_last_sent_at';
const MIN_INTERVAL_MS = 5 * 60 * 1000;

export async function pushLiveLocation(authToken?: string, options?: { force?: boolean }) {
  try {
    const token = authToken || (await tokenManager.getAccessToken());
    if (!token) return;

    if (!options?.force) {
      const lastSent = await AsyncStorage.getItem(LAST_SENT_KEY);
      if (lastSent && Date.now() - Number(lastSent) < MIN_INTERVAL_MS) return;
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) return;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      if (req.status !== 'granted') return;
    }

    let loc: Location.LocationObject | null = null;
    try {
      loc = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
          maximumAge: 60000,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('location_timeout')), 10000)
        ),
      ]);
    } catch (_) {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) loc = last;
      } catch (_2) {}
    }

    if (!loc) return;

    const body: any = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
    };

    try {
      const reverse = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (reverse?.[0]) {
        body.city = reverse[0].city || reverse[0].subregion || undefined;
        body.country = reverse[0].country || undefined;
      }
    } catch (_) {}

    const res = await fetch(`${getApiBaseUrl()}/api/users/me/live-location`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      await AsyncStorage.setItem(LAST_SENT_KEY, String(Date.now()));
    }
  } catch (err: any) {
    if (err?.message !== 'location_timeout') {
      logger.warn('[liveLocation] Failed to push live location:', err);
    }
  }
}
