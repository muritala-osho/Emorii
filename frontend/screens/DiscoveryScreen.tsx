import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScreenErrorFallback } from "@/components/ScreenErrorFallback";
import { useState, useEffect, useCallback, useRef } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Platform, Dimensions, ScrollView, Modal, TextInput, AppState } from "react-native";
import { useThemedAlert } from "@/components/ThemedAlert";
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring, 
  withTiming, 
  withRepeat, 
  withSequence,
  withDelay,
  interpolate, 
  runOnJS, 
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutUp,
} from "react-native-reanimated";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { CompositeNavigationProp, useFocusEffect } from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainTabParamList } from "@/navigation/MainTabNavigator";
import { RootStackParamList } from "@/navigation/RootNavigator";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useLanguage";
import { Spacing, BorderRadius, Typography, Shadow } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { getPhotoSource } from "@/utils/photos";
import { useApi } from "@/hooks/useApi";
import { getApiBaseUrl } from "@/constants/config";
import socketService from "@/services/socket";
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import {
  getCachedPermissionStatus,
  requestAndCachePermission,
} from '@/utils/locationPermission';
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { PremiumBadge } from "@/components/PremiumBadge";
import { VerificationBadge } from "@/components/VerificationBadge";
import { FALLBACK_COUNTRIES, PASSPORT_CITIES, DiscoverUser } from "@/constants/discoveryConstants";
import BlendPopupPage from "@/components/BlendPopupPage";
import logger from "@/utils/logger";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const STABLE_CARD_HEIGHT = SCREEN_HEIGHT * 0.75;
const DISCOVERY_MODE_KEY = '@emorii_discovery_mode';

type DiscoveryScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Discovery">,
  NativeStackNavigationProp<RootStackParamList>
>;

interface DiscoveryScreenProps {
  navigation: DiscoveryScreenNavigationProp;
}

const EmoriiLogo = require('@/assets/emorii-logo.png');

function haversineKm(lat1?: number, lng1?: number, lat2?: number, lng2?: number): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const reverseGeocodeCache = new Map<string, { city?: string; country?: string }>();
async function cachedReverseGeocode(lat: number, lng: number): Promise<{ city?: string; country?: string }> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (reverseGeocodeCache.has(key)) return reverseGeocodeCache.get(key)!;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const result = {
      city: place?.city || place?.district || place?.subregion || undefined,
      country: place?.country || undefined,
    };
    reverseGeocodeCache.set(key, result);
    return result;
  } catch {
    return {};
  }
}

function formatDistanceAway(target: any, currentUser: any): string | null {
  let km: number | null = typeof target?.distance === 'number' ? target.distance : null;
  if (km == null) {
    km = haversineKm(
      currentUser?.location?.lat,
      currentUser?.location?.lng,
      target?.location?.lat,
      target?.location?.lng,
    );
  }
  if (km == null || !isFinite(km) || km < 0) return null;
  if (km < 1) {
    const meters = Math.max(50, Math.round((km * 1000) / 50) * 50);
    return `${meters}m away`;
  }
  if (km < 10) {
    const rounded = Math.round(km * 10) / 10;
    return `${rounded}km away`;
  }
  return `${Math.round(km)}km away`;
}

function DiscoveryScreen({ navigation }: DiscoveryScreenProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, token, updateProfile, fetchUser } = useAuth();
  const { t } = useTranslation();
  const api = useApi();
  const { showAlert, AlertComponent } = useThemedAlert();

  // ─── Face verification gate ───────────────────────────────────────────────
  // Always read the user's latest verification state from the backend on every
  // screen focus so an admin approval is reflected immediately without restart.
  type FaceGateStatus = 'loading' | 'not_requested' | 'pending' | 'approved' | 'rejected';
  // Seed the gate status SYNCHRONOUSLY from the user object we already have in
  // memory. This prevents the visible "flicker" where the screen briefly
  // showed the discovery deck (or a loading spinner) before the verification
  // status fetch returned and snapped the gate UI back into place.
  const seedGateFromUser = (u: any): FaceGateStatus => {
    if (!u) return 'loading';
    // The backend discovery gate requires BOTH isFaceVerified=true AND
    // verificationStatus='approved'. Checking only `verified` is insufficient —
    // users approved via the older admin route had verified=true but isFaceVerified
    // was never set, causing the gate to block them while the frontend showed the
    // deck, resulting in silently empty results.
    const isFaceVerified = u.isFaceVerified === true;
    const isStatusApproved = u.verificationStatus === 'approved';
    if (isFaceVerified && isStatusApproved) return 'approved';
    // Legacy fallback: if isFaceVerified is not yet present on the cached user
    // object (old client cache) but all other signals say approved, treat as
    // approved and let the server-side gate be the authoritative check.
    if (u.isFaceVerified === undefined && (u.verified || isStatusApproved)) return 'approved';
    if (u.verificationStatus === 'pending' || u.verificationStatus === 'in_review') return 'pending';
    if (u.verificationStatus === 'rejected') return 'rejected';
    return 'not_requested';
  };
  const [faceGateStatus, setFaceGateStatus] = useState<FaceGateStatus>(() => seedGateFromUser(user));
  // Ref so checkFaceGate can read the current status without being a dep
  const faceGateStatusRef = useRef<FaceGateStatus>(seedGateFromUser(user));
  useEffect(() => { faceGateStatusRef.current = faceGateStatus; }, [faceGateStatus]);

  // Keep the gate in sync when the global user object updates (e.g. after
  // fetchUser refreshes). Only downgrade *away* from 'approved' if the
  // server explicitly says so — this prevents transient null/loading states
  // from making the gate flicker back open.
  useEffect(() => {
    const seeded = seedGateFromUser(user);
    if (seeded === 'loading') return;
    if (seeded === faceGateStatusRef.current) return;
    if (faceGateStatusRef.current === 'approved' && seeded !== 'approved' && seeded !== 'rejected') {
      // Don't lose 'approved' just because user briefly came back without
      // verificationStatus populated. We'll only revert on rejected/explicit.
      return;
    }
    setFaceGateStatus(seeded);
  }, [user, (user as any)?.verified, (user as any)?.verificationStatus]);

  const checkFaceGate = useCallback(async () => {
    if (!token) return;
    // Don't reset to 'loading' here — we already have a sensible seeded value
    // from the user object, and showing 'loading' would re-introduce the
    // flicker we just fixed. We just refresh from the server in the
    // background and update once data arrives.
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/verification/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data?.success && data?.data) {
        const { verified, isFaceVerified, status } = data.data;
        // The backend discovery gate requires isFaceVerified=true AND
        // verificationStatus='approved'. Mirror that exact condition here.
        if (isFaceVerified && status === 'approved') {
          setFaceGateStatus('approved');
        } else if (!isFaceVerified && verified && status === 'approved') {
          // Edge case: approved in DB but isFaceVerified not yet backfilled.
          // Still grant gate access — the migration will fix the flag momentarily.
          setFaceGateStatus('approved');
        } else if (status) {
          setFaceGateStatus(status as FaceGateStatus);
        }
        // If status is missing/null, leave the seeded value alone — never
        // downgrade to 'not_requested' when we already have 'pending' from
        // the user object.
      }
      // On non-success response we deliberately do nothing so the seeded
      // value sticks. This kills the "pending → not_requested → pending"
      // flicker that happened on slow networks.
    } catch {
      // Network error — keep seeded state, retry on next focus.
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      checkFaceGate();
      // Refresh user context in background so the rest of the app stays in sync
      fetchUser().catch(() => {});
      // Silently reload the discovery deck when the user navigates back to this
      // tab so any new profiles that appeared since the last visit surface
      // immediately.  loadPotentialMatches has a 3-second internal rate-limit
      // so rapid tab switches never produce duplicate API calls.
      if (faceGateStatusRef.current === 'approved') {
        loadPotentialMatchesRef.current?.(true /* silent */);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // When returning from FiltersScreen, check if the discovery mode was changed
  // there and apply it here (e.g. open country picker if switched to global).
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(DISCOVERY_MODE_KEY).then(stored => {
        if (!stored) return;
        if (stored === 'global' && discoveryTypeRef.current !== 'global') {
          handleDiscoveryTypeChange('global');
        } else if (stored === 'local' && discoveryTypeRef.current !== 'local') {
          hasAutoRetriedRef.current = false;
          setDailyLimitReached(false);
          setDiscoveryType('local');
          discoveryTypeRef.current = 'local';
          setSelectedCountry(null);
          setUsers([]);
          setLoading(true);
        }
      }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Real-time verification updates. The backend emits `user:verified` to
  // (a) the user that just got approved, so they can flip from "pending" to
  // the discovery deck without needing to background+foreground the app, and
  // (b) it ALSO invalidates the global `discovery:*` cache so any matched-area
  // viewer who reloads sees the newly verified person right away. To make
  // step (b) feel real-time too, we also reload our own deck on any verified
  // event — that way the freshly-approved user pops in within a few seconds
  // without the viewer having to swipe / pull.
  useEffect(() => {
    const handleUserVerified = (data: { userId?: string; verified?: boolean }) => {
      const isMe = data?.userId && String(data.userId) === String(user?.id || '');
      if (isMe) {
        setFaceGateStatus('approved');
        // Pull fresh user object so AuthContext flips isFaceVerified=true and
        // any other screen that reads `user.verified` updates immediately.
        fetchUser().catch(() => {});
      }
      // Re-check the gate (cheap server call) and then silently reload the
      // deck — works for both "I just got verified" and "someone else did".
      checkFaceGate();
      loadPotentialMatchesRef.current?.(true);
    };

    if (socketService && typeof socketService.on === 'function') {
      socketService.on('user:verified', handleUserVerified);
    }
    return () => {
      if (socketService && typeof socketService.off === 'function') {
        socketService.off('user:verified', handleUserVerified);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Real-time match notification for the user who liked first ─────────────
  // When user A likes user B and B later likes A back, the backend emits
  // `match:new` to A's socket. This listener shows the MatchPopup on A's
  // device — mirroring what B already sees from the HTTP response.
  useEffect(() => {
    const handleMatchNew = (data: {
      matchId?: string;
      matchedUser?: { id: string; name: string; photos: string[] };
      isSuperLike?: boolean;
    }) => {
      if (!data?.matchedUser || !user) return;
      navigation.navigate('MatchPopup', {
        currentUser: {
          id: user.id,
          name: user.name,
          photos: user.photos || [],
        },
        matchedUser: {
          id: data.matchedUser.id,
          name: data.matchedUser.name,
          photos: data.matchedUser.photos || [],
        },
        isSuperLike: data.isSuperLike ?? false,
      });
    };

    if (socketService && typeof socketService.on === 'function') {
      socketService.on('match:new', handleMatchNew);
    }
    return () => {
      if (socketService && typeof socketService.off === 'function') {
        socketService.off('match:new', handleMatchNew);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Real-time new nearby user ─────────────────────────────────────────────
  // When a new user sets their location or gets face-verified, the backend
  // emits `discovery:new_user` to every nearby user whose deck is exhausted.
  // We prepend the new card so it appears immediately without a full reload.
  useEffect(() => {
    const handleNewDiscoveryUser = (data: { user: any }) => {
      if (!data?.user) return;

      // Normalize photos: the backend may send photo objects {url, _id, ...}
      // or plain URL strings.  The card renderer always expects strings.
      const rawPhotos: any[] = data.user.photos || [];
      const normalizedPhotos = rawPhotos
        .map((p: any) => {
          if (typeof p === 'string') return p;
          if (p && typeof p === 'object') return p.url || p.uri || null;
          return null;
        })
        .filter(Boolean) as string[];

      const newCard: DiscoverUser = {
        ...data.user,
        id: data.user._id,
        photos: normalizedPhotos,
        online: data.user.online ?? null,
        distance: data.user.distance ?? null,
        similarityScore: 50,
      };
      setUsers(prev => {
        const alreadyInDeck = prev.some(u => u.id === newCard.id || (u as any)._id === newCard.id);
        if (alreadyInDeck) return prev;
        return [newCard, ...prev];
      });
      // Reset the exhausted flag so a fresh load isn't blocked.
      stackExhaustedReportedRef.current = false;
      // Show the "New person found nearby!" banner briefly and fire haptics.
      setNewUserFound(true);
      setTimeout(() => setNewUserFound(false), 3000);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };

    if (socketService && typeof socketService.on === 'function') {
      socketService.on('discovery:new_user', handleNewDiscoveryUser);
    }
    return () => {
      if (socketService && typeof socketService.off === 'function') {
        socketService.off('discovery:new_user', handleNewDiscoveryUser);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Lightweight discovery:refresh signal ─────────────────────────────────
  // When a new user is face-verified and nearby non-exhausted online users
  // should silently reload their deck, the backend emits 'discovery:refresh'.
  // No card data is sent — the frontend simply queues a silent background
  // reload so the new profile surfaces within the current swipe session.
  useEffect(() => {
    const handleDiscoveryRefresh = () => {
      if (faceGateStatusRef.current !== 'approved') return;
      logger.log('[DISCOVERY] discovery:refresh received — queuing silent reload');
      loadPotentialMatchesRef.current?.(true /* silent */);
    };

    if (socketService && typeof socketService.on === 'function') {
      socketService.on('discovery:refresh', handleDiscoveryRefresh);
    }
    return () => {
      if (socketService && typeof socketService.off === 'function') {
        socketService.off('discovery:refresh', handleDiscoveryRefresh);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Foreground-return poll ────────────────────────────────────────────────
  // When the user's verification is pending and they switch back to the app
  // from the background, automatically re-check the gate status. This means
  // a user who gets approved while the app is backgrounded will see the
  // discovery deck appear the moment they re-open the app — no tap required.
  // For already-approved users, a silent discovery reload is triggered so any
  // new profiles that appeared while the app was in the background surface
  // immediately on return — no manual refresh needed.
  useEffect(() => {
    const appStateRef = { prev: AppState.currentState };
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground =
        appStateRef.prev === 'background' || appStateRef.prev === 'inactive';
      const isNowActive = nextState === 'active';
      if (wasBackground && isNowActive) {
        if (faceGateStatusRef.current === 'pending') {
          checkFaceGate();
          fetchUser().catch(() => {});
        } else if (faceGateStatusRef.current === 'approved') {
          // Silently refresh the deck so profiles that joined while the app
          // was backgrounded appear right away. Rate-limited internally to 3 s.
          loadPotentialMatchesRef.current?.(true /* silent */);
        }
      }
      appStateRef.prev = nextState;
    });
    return () => subscription.remove();
  // checkFaceGate and fetchUser are stable callbacks — no need to list them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Persist the last batch of discovery cards to AsyncStorage so the deck
  // renders instantly on cold app open instead of showing a spinner while
  // waiting for /users/nearby. Available to all users.
  const DISCOVERY_CACHE_KEY = `discovery_cache_v1:${user?.id || 'anon'}`;
  const DISCOVERY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  const [loading, setLoading] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [radarScanning, setRadarScanning] = useState(false);
  const [newUserFound, setNewUserFound] = useState(false);
  const [locationPermissionChecked, setLocationPermissionChecked] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [requiresLocation, setRequiresLocation] = useState(false);
  const [showSuperLikeAnimation, setShowSuperLikeAnimation] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [discoveryType, setDiscoveryType] = useState<'local' | 'global'>('local');

  // Load persisted discovery mode on mount
  useEffect(() => {
    AsyncStorage.getItem(DISCOVERY_MODE_KEY).then(stored => {
      if (stored === 'global' || stored === 'local') {
        setDiscoveryType(stored);
        if (stored === 'global') discoveryTypeRef.current = 'global';
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist discovery mode whenever it changes
  useEffect(() => {
    AsyncStorage.setItem(DISCOVERY_MODE_KEY, discoveryType).catch(() => {});
  }, [discoveryType]);

  const [passportActive, setPassportActive] = useState(false);
  const [passportCity, setPassportCity] = useState('');
  const [showPassportModal, setShowPassportModal] = useState(false);
  const [passportSearch, setPassportSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countries, setCountries] = useState<string[]>([]);
  const [showSecondChance, setShowSecondChance] = useState(false);
  const [secondChanceProfiles, setSecondChanceProfiles] = useState<any[]>([]);
  const [secondChanceLoading, setSecondChanceLoading] = useState(false);
  const [blendMatch, setBlendMatch] = useState<{
    user: DiscoverUser;
    shared: string[];
    songMatch?: { type: 'song' | 'artist'; title?: string; artist?: string; albumArt?: string };
  } | null>(null);
  const blendShownIds = useRef<Set<string>>(new Set());
  const seenUserIds = useRef<Set<string>>(new Set());
  const userHistory = useRef<DiscoverUser[]>([]);
  const [cardPhotoIndex, setCardPhotoIndex] = useState(0);

  // ── Stable refs for mode state ─────────────────────────────────────────────
  // The radar interval callback is created once and reads all live values
  // through refs so it doesn't need to be torn down/restarted on mode changes.
  const discoveryTypeRef = useRef<'local' | 'global'>(discoveryType);
  const passportActiveRef = useRef(false);
  // Tracks whether we have already done the one automatic retry for the current
  // discovery session (country + mode combination). Prevents the empty-state
  // from entering an infinite re-fetch loop when a specific country or passport
  // location genuinely has no visible users.
  const hasAutoRetriedRef = useRef(false);

  // Set true when the backend returns a daily-swipe-limit 403. Shows an
  // in-screen upgrade gate. User can dismiss it to keep browsing (but the
  // next right-swipe will hit the gate again until tomorrow).
  const [dailyLimitReached, setDailyLimitReached] = useState(false);

  // Hard rate-limit: loadPotentialMatches may not be called more than once
  // every 3 seconds regardless of what triggers it (GPS coord ticks, user
  // object re-fetches, etc.). This is the last line of defence against the
  // 1-call-per-second loop seen when location updates drive rapid useEffect
  // re-fires while the country filter returns 0 users.
  const lastLoadCallMsRef = useRef(0);
  const LOAD_COOLDOWN_MS = 3000;

  // Stable refs that always point to the latest callback / primitive value.
  // Using refs instead of putting functions in useEffect dep arrays prevents
  // spurious re-runs caused by useCallback identity changes.
  const loadPotentialMatchesRef = useRef<((silent?: boolean) => Promise<void>) | null>(null);
  const fetchRadarNearbyUsersRef = useRef<(() => Promise<void>) | null>(null);
  const tokenRef = useRef<string | null>(token ?? null);
  const hasLocationPermissionRef = useRef<boolean | null>(hasLocationPermission);
  
  const superLikeScale = useSharedValue(0);
  const superLikeOpacity = useSharedValue(0);
  const superLikeRotation = useSharedValue(0);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardRotation = useSharedValue(0);
  const cardScale = useSharedValue(1);
  const cardOpacity = useSharedValue(1);
  
  const radarPulse = useSharedValue(1);
  const radarPulse2 = useSharedValue(1);
  const radarRotation = useSharedValue(0);
  
  const actionButtonScale = useSharedValue(1);
  const likeButtonScale = useSharedValue(1);
  const messageButtonScale = useSharedValue(1);
  const rewindButtonScale = useSharedValue(1);
  const starButtonScale = useSharedValue(1);



  const fetchCountries = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.get<{ success: boolean; countries: string[] }>('/users/countries', {}, token);
      if (response.success && response.data?.countries) {
        setCountries(response.data.countries);
      }
    } catch (error) {
      logger.error('Failed to fetch countries:', error);
    }
  }, [token, api]);

  const checkLocationPermission = useCallback(async () => {
    // Use the cached permission value when possible so we don't re-query the
    // OS (or repeatedly trigger any system-side throttles) on every screen
    // focus. The cache TTLs out at 24h.
    const status = await getCachedPermissionStatus();
    const granted = status === 'granted';
    setHasLocationPermission(granted);
    setLocationPermissionChecked(true);
    return granted;
  }, []);

  const fetchRadarNearbyUsers = useCallback(async () => {
    if (!token) {
      logger.log('[DISCOVERY RADAR] Skipped - no token');
      return;
    }
    // Skip all radar work while the face-verification gate is active.
    // The gate screen is visible, so scanning, updating location and toggling
    // setRadarScanning/setLoading state would only cause the gate UI to
    // re-render and appear to "reload" on every interval tick.
    if (faceGateStatusRef.current !== 'approved') {
      logger.log('[DISCOVERY RADAR] Skipped - face gate not approved');
      return;
    }
    if (hasLocationPermission === false) {
      logger.log('[DISCOVERY RADAR] Skipped - no location permission');
      return;
    }
    
    try {
      setRadarScanning(true);
      
      let permissionGranted: boolean | null = hasLocationPermission;
      if (!locationPermissionChecked) {
        const status = await getCachedPermissionStatus();
        permissionGranted = status === 'granted';
        setHasLocationPermission(permissionGranted);
        setLocationPermissionChecked(true);

        if (!permissionGranted) {
          setRadarScanning(false);
          return;
        }
      }
      
      if (permissionGranted !== true) {
        setRadarScanning(false);
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const coords = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      };

      const locationName = await cachedReverseGeocode(coords.lat, coords.lng);

      try {
        await fetch(`${getApiBaseUrl()}/api/radar/location`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ...coords, ...locationName }),
        });
      } catch (locationUpdateError) {
        logger.log('[DISCOVERY RADAR] Could not update live user location', locationUpdateError);
      }
      
      const params = new URLSearchParams({
        lat: coords.lat.toString(),
        lng: coords.lng.toString(),
        radius: '50',
        ageMin: (user?.preferences?.ageRange?.min || 18).toString(),
        ageMax: (user?.preferences?.ageRange?.max || 50).toString(),
        gender: user?.preferences?.genderPreference || (user?.preferences as any)?.genders?.[0] || 'any',
        limit: '20'
      });

      const response = await fetch(
        `${getApiBaseUrl()}/api/radar/nearby-users?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      logger.log(`[DISCOVERY RADAR] Received ${data.users?.length || 0} users from radar`);
      if (data.success && data.users?.length > 0) {
        const radarUsers: DiscoverUser[] = data.users.map((u: any) => {
          const photoUrl = u.profilePhoto || (u.photos?.[0]?.url || u.photos?.[0]);
          return {
            id: u.id || u._id,
            name: u.name || 'Unknown',
            age: u.age,
            bio: u.bio || '',
            photos: photoUrl ? [photoUrl] : [],
            interests: u.interests || [],
            online: u.online,
            distance: u.distance,
            gender: u.gender || 'unknown',
            verified: u.verified || false,
            favoriteSong: u.favoriteSong || undefined,
          };
        });
        
        setUsers(prev => {
          // Don't inject GPS-based radar users into a global or passport
          // discovery session — it would mix local profiles into a feed that
          // should only show users from a chosen city/country.
          if (discoveryTypeRef.current !== 'local' || passportActiveRef.current) {
            return prev;
          }

          prev.forEach(u => seenUserIds.current.add(u.id));
          
          const newUsers = radarUsers.filter(u => !seenUserIds.current.has(u.id));
          if (newUsers.length > 0) {
            newUsers.forEach(u => seenUserIds.current.add(u.id));
            setNewUserFound(true);
            setTimeout(() => setNewUserFound(false), 3000);
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            setLoading(false);
            return [...prev, ...newUsers];
          }
          return prev;
        });
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (error) {
      logger.error("Radar fetch error:", error);
      setLoading(false);
    } finally {
      setRadarScanning(false);
    }
  }, [token, user?.preferences?.ageRange?.min, user?.preferences?.ageRange?.max, hasLocationPermission, locationPermissionChecked]);

  // Tracks whether a silent "next batch" prefetch is currently in-flight so we
  // don't fire multiple background loads when the user is rapidly swiping
  // through the last few cards of the current batch.
  const prefetchInFlightRef = useRef(false);
  // Tracks whether we've already pinged the backend that this user has
  // exhausted their discovery stack. We only want to ping once per actual
  // empty result, so the backend cron can later push a "new people are
  // waiting" notification.
  const stackExhaustedReportedRef = useRef(false);

  const reportStackExhausted = useCallback(() => {
    if (stackExhaustedReportedRef.current) return;
    if (!token) return;
    stackExhaustedReportedRef.current = true;
    api
      .post('/users/discovery-stack-exhausted', {}, token)
      .catch(() => {
        // Silent — this is a best-effort hint to the backend cron that the
        // user should be notified later when fresh people show up.
      });
  }, [api, token]);

  const resetDiscoverySession = useCallback(() => {
    hasAutoRetriedRef.current = false;
    seenUserIds.current.clear();
    stackExhaustedReportedRef.current = false;
  }, []);

  const loadPotentialMatches = useCallback(async (silent = false, append = false) => {
    if (!user?.id || !token) {
      logger.log('[DISCOVERY] loadPotentialMatches skipped - no user or token');
      setLoading(false);
      return;
    }

    // Don't run discovery while the face-verification gate is blocking.
    // The backend would 403, and the setLoading(true→false) toggle causes
    // the gate screen to re-render and visually "reload" on every call.
    if (faceGateStatusRef.current !== 'approved') {
      if (!silent) setLoading(false);
      logger.log('[DISCOVERY] loadPotentialMatches skipped - face gate not approved');
      return;
    }

    // Hard rate-limit: skip if the last successful call was < 3 s ago.
    // Prevents the 1-call-per-second loop that occurs when GPS coord updates
    // change currentPrefs on every tick and re-fire the discovery useEffect
    // while the country filter is returning 0 results.
    const now = Date.now();
    if (!append && now - lastLoadCallMsRef.current < LOAD_COOLDOWN_MS) {
      logger.log('[DISCOVERY] loadPotentialMatches rate-limited, skipping');
      return;
    }
    if (!append) lastLoadCallMsRef.current = now;

    logger.log('[DISCOVERY] loadPotentialMatches starting...');
    try {
      if (!silent) setLoading(true);
      const params: Record<string, any> = {
        limit: 50,
      };

      // Normalize stored coords. The user may have either flat lat/lng or the
      // GeoJSON form `location.coordinates: [lng, lat]` from the server. Read
      // both so the request always includes coordinates if ANY form exists —
      // this keeps the cache key stable and lets distance be computed on the
      // first load instead of the silent stored-coord fallback.
      const loc: any = user.location || {};
      // GeoJSON stores coordinates as [lng, lat]; also support legacy flat fields.
      const storedLat = loc.lat ?? loc.coordinates?.coordinates?.[1] ?? loc.coordinates?.[1];
      const storedLng = loc.lng ?? loc.coordinates?.coordinates?.[0] ?? loc.coordinates?.[0];
      // Reject [0, 0] — it is the Mongoose default for users who never shared
      // their GPS. Number.isFinite(0) is true, so without this guard the
      // request would search near the Gulf of Guinea and return zero users.
      const hasValidCoords =
        Number.isFinite(storedLat) &&
        Number.isFinite(storedLng) &&
        !(storedLat === 0 && storedLng === 0);

      if (discoveryType === 'local' && hasValidCoords) {
        params.lat = storedLat;
        params.lng = storedLng;
        // Free users are capped at 50km, premium users can go up to their
        // preferred max distance. The backend enforces the same cap, so this
        // is mainly for cache-key stability.
        const rawMax = user.preferences?.maxDistance || 50;
        params.maxDistance = user.premium?.isActive ? rawMax : Math.min(rawMax, 50);
      } else if (discoveryType === 'global') {
        params.global = true;
        if (selectedCountry) {
          params.country = selectedCountry;
        }
      }

      const prefs = user.preferences as any;

      if (prefs?.ageRange) {
        params.minAge = Number(prefs.ageRange.min);
        params.maxAge = Number(prefs.ageRange.max);
      }

      const userGender = user.gender?.toLowerCase();
      if (prefs?.genderPreference && prefs.genderPreference !== 'any' && prefs.genderPreference !== 'both') {
        params.genders = prefs.genderPreference;
      } else if (prefs?.gender && prefs.gender !== 'any') {
        params.genders = prefs.gender;
      } else if (userGender === 'male') {
        params.genders = 'female';
      } else if (userGender === 'female') {
        params.genders = 'male';
      }

      if (prefs?.showVerifiedOnly) params.verifiedOnly = 'true';
      if (prefs?.onlineNow) params.onlineOnly = 'true';

      // Lifestyle filters — only sent when the user has explicitly set them
      // (i.e. not "any" / null). This respects the user's filter choices
      // without narrowing the pool for users who haven't configured them.
      const lifestyle = (user as any)?.lifestyle;
      if (prefs?.smoking && prefs.smoking !== 'any') params.smoking = prefs.smoking;
      if (prefs?.drinking && prefs.drinking !== 'any') params.drinking = prefs.drinking;
      if (prefs?.wantsKids != null && prefs.wantsKids !== 'any') params.wantsKids = String(prefs.wantsKids);
      if (lifestyle?.religion && lifestyle.religion !== 'any') params.religion = lifestyle.religion;
      if ((user as any)?.lookingFor && (user as any).lookingFor !== 'any') params.lookingFor = (user as any).lookingFor;
      if (Array.isArray(prefs?.interests) && prefs.interests.length > 0) params.interests = prefs.interests.join(',');

      const response = await api.get<{ success: boolean; users: any[] }>('/users/nearby', params, token);
      logger.log('API Response Success:', response.success);
      logger.log('API Params:', JSON.stringify(params));
      if (response.data) {
        logger.log('Users Array Length:', response.data.users?.length);
        if (response.data.users?.length > 0) {
          logger.log('First User sample:', JSON.stringify(response.data.users[0]).substring(0, 100));
        } else {
          logger.log('[DISCOVERY] API returned success but empty users array');
        }
      } else {
        logger.log('[DISCOVERY] API response has no data property');
      }
      
      logger.log('[DISCOVERY] API call complete, response:', response.success);
      if (response.success && (response.data as any)?.requiresLocation) {
        logger.log('[DISCOVERY] Backend says location required — showing gate');
        setRequiresLocation(true);
        setUsers([]);
        setLoading(false);
        return;
      }
      setRequiresLocation(false);
      if (response.success && response.data?.users) {
        logger.log(`[DISCOVERY] Success. Raw users count: ${response.data.users.length}`);
        const myInterests = new Set(user.interests || []);

        const usersWithSimilarity = response.data.users.map((u: any) => {
          const userPhotos = u.photos && u.photos.length > 0 ? u.photos : (u.profilePhoto ? [u.profilePhoto] : []);
          if (userPhotos.length === 0) {
            logger.log(`[DISCOVERY] User ${u._id} has NO photos in raw data`);
          }
          
          const processedPhotos = userPhotos.map((p: any) => {
            if (typeof p === 'string') return p;
            if (p && typeof p === 'object' && p.url) return p.url;
            return null;
          }).filter(Boolean);
          
          if (processedPhotos.length === 0) {
             logger.log(`[DISCOVERY] User ${u._id} has NO valid photo URLs`);
          }

          const theirInterests = u.interests || [];
          const sharedInterests = theirInterests.filter((i: string) => myInterests.has(i));
          
          const personalityMatch = (user as any).personalityType && (u as any).personalityType && (user as any).personalityType === (u as any).personalityType;
          const personalityBonus = personalityMatch ? 20 : 0;

          const similarityScore = myInterests.size > 0
            ? Math.min(100, ((sharedInterests.length / Math.max(myInterests.size, theirInterests.length)) * 100) + personalityBonus)
            : personalityBonus;

          return {
            id: u._id || u.id,
            name: u.name || 'Unknown',
            age: u.age,
            bio: u.bio || '',
            photos: processedPhotos,
            interests: u.interests || [],
            online: u.online,
            distance: u.distance,
            similarityScore,
            sharedInterests,
            gender: u.gender || 'male',
            verified: u.verified || false,
            location: u.location,
            isBoosted: u.isBoosted || false,
            needsVerification: u.needsVerification || false,
            premium: u.premium || undefined,
            favoriteSong: u.favoriteSong || undefined,
          };
        });

        usersWithSimilarity.sort((a, b) => {
          if (a.isBoosted && !b.isBoosted) return -1;
          if (!a.isBoosted && b.isBoosted) return 1;
          if (discoveryType === 'local') {
            const da = a.distance ?? 99999;
            const db = b.distance ?? 99999;
            return da - db;
          }
          return Math.random() - 0.5;
        });
        
        // For append loads: filter out users already in the deck to avoid
        // duplicates. For primary (non-append) loads the server already
        // excludes swiped users, so applying seenUserIds here would wrongly
        // hide people who were only in the previous cache — causing the "open
        // app → see card → card vanishes" bug on every cold open.
        const filteredUsers = append
          ? usersWithSimilarity.filter(u => !seenUserIds.current.has(u.id))
          : usersWithSimilarity;
        filteredUsers.forEach(u => seenUserIds.current.add(u.id));

        if (append) {
          // Background prefetch — keep current card position, just add new
          // people to the end of the deck so swiping never has to wait.
          if (filteredUsers.length > 0) {
            setUsers(prev => [...prev, ...filteredUsers]);
            stackExhaustedReportedRef.current = false;
          } else {
            // Server has no more people right now — flag the stack as
            // exhausted so the backend cron can push a notification later
            // when fresh users appear.
            reportStackExhausted();
          }
        } else {
          if (filteredUsers.length > 0) {
            // Got fresh users not yet seen — update the deck.
            setUsers(filteredUsers);
            setCurrentIndex(0);
            stackExhaustedReportedRef.current = false;

            // Persist the batch so the next cold-open renders the deck instantly.
            AsyncStorage.setItem(
              DISCOVERY_CACHE_KEY,
              JSON.stringify({
                users: filteredUsers.slice(0, 30),
                cachedAt: Date.now(),
                discoveryType,
                selectedCountry,
              }),
            ).catch(() => {});

            // Warm the image cache for the first few cards so they appear
            // instantly the moment the user arrives at them.
            try {
              const upcomingPhotos = filteredUsers
                .slice(0, 3)
                .map((u: any) => u.photos?.[0])
                .filter(Boolean) as string[];
              if (upcomingPhotos.length > 0) {
                Image.prefetch(upcomingPhotos).catch(() => {});
              }
            } catch {}
          } else if (!silent) {
            // Empty result on a primary fetch with no cached fallback.
            // Reset the session so a fresh refresh can rediscover new users
            // instead of staying stuck on the exhausted cache.
            resetDiscoverySession();
            reportStackExhausted();
            if (!hasAutoRetriedRef.current) {
              hasAutoRetriedRef.current = true;
              // Small delay so the state flush settles before the next fetch.
              setTimeout(() => loadPotentialMatchesRef.current?.(), 800);
            }
          } else {
            // silent + empty: the backend returned only already-seen users.
            // Cached cards are still visible — do NOT wipe the deck.
            // Just flag the stack exhausted in the background so the cron
            // can push a "new people nearby" notification later.
            reportStackExhausted();
          }
        }
      } else if (!append) {
        resetDiscoverySession();
        reportStackExhausted();
        if (!hasAutoRetriedRef.current) {
          hasAutoRetriedRef.current = true;
          setTimeout(() => loadPotentialMatchesRef.current?.(), 800);
        }
      }
    } catch (error: any) {
      // The backend discovery gate returns 403 when the requesting user hasn't
      // completed face verification. useApi throws on non-2xx responses, so we
      // detect it here from the error message and set the gate state accordingly
      // rather than silently leaving the deck empty with no explanation.
      const msg: string = error?.message || '';
      const isVerificationGateError =
        msg.toLowerCase().includes('face verification') ||
        msg.toLowerCase().includes('verification required');
      if (isVerificationGateError) {
        logger.log('[DISCOVERY] Backend returned face-verification gate — updating gate status');
        setFaceGateStatus('not_requested');
        setUsers([]);
        if (!silent) setLoading(false);
        if (append) prefetchInFlightRef.current = false;
        return;
      }
      logger.error("[DISCOVERY] Error loading nearby users:", error);
    } finally {
      if (!silent) setLoading(false);
      if (append) prefetchInFlightRef.current = false;
    }
  // user.location is GeoJSON { type, coordinates: [lng, lat], city, country } —
  // it has NO flat .lat / .lng fields, so those would always be undefined and
  // location changes would never re-create this callback. Use the actual
  // array values instead.
  // discoveryType is included so the callback always captures the current mode.
  // Without it, switching mode without also changing selectedCountry would leave
  // the closure pointing at the old mode and run a fetch with the wrong params.
  }, [user?.id, token, user?.location?.coordinates?.[1], user?.location?.coordinates?.[0], user?.preferences?.maxDistance, user?.preferences?.ageRange?.min, user?.preferences?.ageRange?.max, user?.interests, user?.gender, selectedCountry, discoveryType, reportStackExhausted]);

  // Keep stable refs in sync with latest values — zero cost, runs after each render.
  useEffect(() => { loadPotentialMatchesRef.current = loadPotentialMatches; }, [loadPotentialMatches]);
  useEffect(() => { fetchRadarNearbyUsersRef.current = fetchRadarNearbyUsers; }, [fetchRadarNearbyUsers]);
  useEffect(() => { tokenRef.current = token ?? null; }, [token]);
  useEffect(() => { hasLocationPermissionRef.current = hasLocationPermission; }, [hasLocationPermission]);
  // Keep mode refs in sync so the radar interval (created once, never recreated)
  // always reads the latest discovery mode without needing deps.
  useEffect(() => { discoveryTypeRef.current = discoveryType; }, [discoveryType]);
  useEffect(() => { passportActiveRef.current = passportActive; }, [passportActive]);

  // ── Restore passport state from the backend user object ───────────────────
  // passportActive / passportCity start as false/'' on every mount (they are
  // not persisted to AsyncStorage).  If the user had Passport active before
  // they killed the app, the badge and city name disappear on reopen even
  // though the backend is still using passport coordinates for discovery.
  // This effect seeds the UI state from user.passportLocation so the badge
  // is always shown whenever the backend has an active passport location.
  useEffect(() => {
    const pl = (user as any)?.passportLocation;
    if (pl?.isActive && (pl?.city || pl?.country)) {
      setPassportActive(true);
      setPassportCity(pl.city || pl.country || 'Passport City');
    } else if (!pl?.isActive) {
      // Passport was cleared server-side (e.g. from another device) —
      // reflect that in the UI without requiring a manual clear.
      setPassportActive(false);
      setPassportCity('');
    }
  // Only re-run when the user ID changes (account switch / fresh login).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, (user as any)?.passportLocation?.isActive, (user as any)?.passportLocation?.city]);

  // Auto-refresh when the deck is exhausted — polls every 2 minutes so newly
  // signed-up nearby users appear automatically without the user tapping Refresh.
  // Only active when: empty state is visible, not currently loading, and face
  // gate is approved (i.e. the user can actually see discovery cards).
  useEffect(() => {
    const isExhausted = users.length === 0 && !loading && faceGateStatus === 'approved';
    if (!isExhausted) return;

    const interval = setInterval(() => {
      resetDiscoverySession();
      loadPotentialMatchesRef.current?.();
    }, 2 * 60 * 1000);

    return () => clearInterval(interval);
  }, [users.length, loading, faceGateStatus, resetDiscoverySession]);

  const hasInitiallyLoaded = useRef(false);
  const preferencesRef = useRef<string>('');
  
  useEffect(() => {
    if (!user?.id || !token) return;
    
    if (user?.photos?.length === 0) {
      logger.log('[DISCOVERY] User has no photos, might be stuck');
    }

    const prefs = user?.preferences as any;
    const lifestyle = (user as any)?.lifestyle;
    const currentPrefs = JSON.stringify({
      lat: user?.location?.coordinates?.[1],
      lng: user?.location?.coordinates?.[0],
      maxDistance: prefs?.maxDistance,
      ageMin: prefs?.ageRange?.min,
      ageMax: prefs?.ageRange?.max,
      gender: user?.gender,
      genderPref: prefs?.genderPreference,
      verifiedOnly: prefs?.showVerifiedOnly,
      onlineNow: prefs?.onlineNow,
      lookingFor: lifestyle?.lookingFor,
      religion: lifestyle?.religion,
      smoking: prefs?.smoking,
      drinking: prefs?.drinking,
      wantsKids: prefs?.wantsKids,
      discoveryType: discoveryType,
      selectedCountry: selectedCountry,
    });
    
    if (!hasInitiallyLoaded.current || currentPrefs !== preferencesRef.current) {
      const isFirstLoad = !hasInitiallyLoaded.current;
      hasInitiallyLoaded.current = true;
      preferencesRef.current = currentPrefs;
      
      const loadData = async () => {
        // Instant render on first mount: hydrate from AsyncStorage cache so
        // photo cards appear immediately — no spinner on cold open.
        // We still fire the network call in background to refresh the deck.
        let hadCachedUsers = false;
        if (isFirstLoad) {
          try {
            const cached = await AsyncStorage.getItem(DISCOVERY_CACHE_KEY);
            if (cached) {
              const parsed = JSON.parse(cached);
              const fresh =
                parsed?.cachedAt &&
                Date.now() - parsed.cachedAt < DISCOVERY_CACHE_TTL_MS &&
                parsed?.discoveryType === discoveryType &&
                (parsed?.selectedCountry || null) === (selectedCountry || null) &&
                Array.isArray(parsed?.users) &&
                parsed.users.length > 0;
              if (fresh) {
                setUsers(parsed.users);
                setCurrentIndex(0);
                setLoading(false);
                parsed.users.forEach((u: any) => seenUserIds.current.add(u.id));
                hadCachedUsers = true;
              }
            }
          } catch {
            // Ignore cache read errors — fall through to normal load
          }
        }
        // Background-refresh: pass silent=true when we already showed cached
        // cards so the loading spinner never appears over a usable deck.
        // Call via ref so this effect doesn't re-run when the callback identity changes.
        await loadPotentialMatchesRef.current?.(hadCachedUsers);
        if (users.length < 3) {
          fetchRadarNearbyUsersRef.current?.();
        }
      };
      loadData();
    }
  // Intentionally omit loadPotentialMatches / fetchRadarNearbyUsers — their
  // identity changes when their own deps change, which would cause this effect
  // to re-fire and trigger duplicate API calls. We reach them via stable refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token, user?.location?.coordinates?.[1], user?.location?.coordinates?.[0], user?.preferences?.maxDistance, user?.preferences?.ageRange?.min, user?.preferences?.ageRange?.max, user?.gender, discoveryType, selectedCountry]);

  const radarIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isAnimatingRef = useRef(false);
  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);

  useFocusEffect(
    // Empty dep array: set up the interval once per screen-focus cycle.
    // All live values are read through stable refs so the interval/timeout
    // is never needlessly torn down and restarted when token or permission
    // state changes (which used to fire a fresh radar scan on every change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useCallback(() => {
      checkLocationPermission();
      
      const initialScanTimeout = setTimeout(() => {
        if (hasLocationPermissionRef.current !== false && tokenRef.current && !isAnimatingRef.current) {
          fetchRadarNearbyUsersRef.current?.();
        }
      }, 1000);
      
      radarIntervalRef.current = setInterval(() => {
        // Skip while a swipe animation is mid-flight to avoid jank
        if (hasLocationPermissionRef.current !== false && tokenRef.current && !isAnimatingRef.current) {
          fetchRadarNearbyUsersRef.current?.();
        }
      }, 30000);
      
      return () => {
        clearTimeout(initialScanTimeout);
        if (radarIntervalRef.current) {
          clearInterval(radarIntervalRef.current);
        }
      };
    }, [])
  );

  useEffect(() => {
    radarPulse.value = withRepeat(
      withTiming(1.3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    radarPulse2.value = withRepeat(
      withTiming(1.2, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    radarRotation.value = withRepeat(
      withTiming(360, { duration: 4000, easing: Easing.linear }),
      -1,
      false
    );
  }, [radarPulse, radarPulse2, radarRotation]);



  const handleDiscoveryTypeChange = (type: 'local' | 'global') => {
    if (type === 'global' && !user?.premium?.isActive) {
      showAlert(
        'Premium Feature',
        'Upgrade to Premium to access Global Discovery and meet people worldwide.',
        [{ text: 'Upgrade Now', onPress: () => navigation.navigate('Premium' as any) }, { text: 'Maybe Later', style: 'cancel' }],
        'star'
      );
      return;
    }
    if (type === 'global') {
      fetchCountries();
      setShowCountryPicker(true);
      return;
    }
    // Switching back to local — reset all session-scoped state.
    hasAutoRetriedRef.current = false;
    setDailyLimitReached(false);
    setDiscoveryType(type);
    setSelectedCountry(null);
    setUsers([]);
    setLoading(true);
  };

  const handleSelectCountry = (country: string | null) => {
    // Reset the retry guard so the new selection always gets its one
    // automatic retry chance before the empty state settles.
    hasAutoRetriedRef.current = false;
    setSelectedCountry(country);
    setShowCountryPicker(false);
    setDiscoveryType('global');
    setUsers([]);
    setLoading(true);
  };


  const radarPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: radarPulse.value }],
    opacity: interpolate(radarPulse.value, [1, 1.3], [0.4, 0.1]),
  }));

  const radarPulse2Style = useAnimatedStyle(() => ({
    transform: [{ scale: radarPulse2.value }],
    opacity: interpolate(radarPulse2.value, [1, 1.2], [0.25, 0.05]),
  }));

  const radarRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${radarRotation.value}deg` }],
  }));

  const handlePassportPress = useCallback(() => {
    if (!user?.premium?.isActive) {
      showAlert(
        'Premium Feature',
        'Passport lets you match with people in any city! Upgrade to Premium to unlock.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', style: 'default', onPress: () => navigation.navigate('Premium') }
        ],
        'globe'
      );
      return;
    }
    setShowPassportModal(true);
  }, [user?.premium?.isActive, showAlert, navigation]);

  const handleSelectPassportCity = useCallback(async (city: typeof PASSPORT_CITIES[0]) => {
    if (!token) return;
    try {
      const response = await api.post<{ success: boolean; message?: string }>(
        '/users/passport-location',
        { lat: city.lat, lng: city.lng, city: city.name, country: city.country, isActive: true },
        token
      );
      if (response.success) {
        setPassportActive(true);
        setPassportCity(city.name);
        setShowPassportModal(false);
        // Reset all session-scoped state for the new passport city.
        hasAutoRetriedRef.current = false;
        setDailyLimitReached(false);
        setLoading(true);
        // Use the ref so we always call the most-current callback, then alert.
        loadPotentialMatchesRef.current?.();
        showAlert('Passport Active', `You're now discovering people in ${city.name}!`, [{ text: 'OK', style: 'default' }], 'globe');
      }
    } catch (error) {
      logger.error('Passport set error:', error);
    }
  }, [token, api, showAlert]);

  const handleClearPassport = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.post<{ success: boolean }>(
        '/users/passport-location',
        { isActive: false },
        token
      );
      if (response.success) {
        setPassportActive(false);
        setPassportCity('');
        setShowPassportModal(false);
        // Reset all session-scoped state when returning to local discovery.
        hasAutoRetriedRef.current = false;
        setDailyLimitReached(false);
        showAlert('Passport Cleared', 'You\'re back to discovering people near you.', [{ text: 'OK', style: 'default' }], 'map-pin');
        setLoading(true);
        loadPotentialMatchesRef.current?.();
      }
    } catch (error) {
      logger.error('Passport clear error:', error);
    }
  }, [token, api, showAlert]);

  const openSecondChance = useCallback(async () => {
    if (!token) return;
    setShowSecondChance(true);
    setSecondChanceLoading(true);
    try {
      const res = await api.get<{ success: boolean; profiles: any[] }>('/match/second-chance', token);
      if (res.success && res.data?.profiles) {
        setSecondChanceProfiles(res.data.profiles);
      }
    } catch (e) {
      logger.error('Second chance fetch error:', e);
    } finally {
      setSecondChanceLoading(false);
    }
  }, [token, api]);

  const handleSecondChanceLike = useCallback(async (targetUser: any) => {
    if (!token) return;
    try {
      await api.post<any>('/friends/request', { receiverId: targetUser._id }, token);
      setSecondChanceProfiles(prev => prev.filter(p => p._id !== targetUser._id));
    } catch (e) {
      logger.error('Second chance like error:', e);
    }
  }, [token, api]);

  const handleSecondChancePass = useCallback(async (targetUser: any) => {
    if (!token) return;
    try {
      await api.post<any>('/match/second-chance/pass', { targetUserId: targetUser._id }, token);
      setSecondChanceProfiles(prev => prev.filter(p => p._id !== targetUser._id));
    } catch (e) {
      logger.error('Second chance pass error:', e);
    }
  }, [token, api]);

  const renderHeader = () => (
    <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
      <Image
        source={EmoriiLogo}
        style={styles.logo}
        contentFit="contain"
      />

      <View style={{ flex: 1 }} />

      <Pressable
        style={styles.headerIconButton}
        onPress={openSecondChance}
      >
        <Feather name="rotate-ccw" size={20} color={theme.text} />
      </Pressable>

      <Pressable
        style={[styles.headerIconButton, passportActive && { backgroundColor: theme.primary + '22', borderRadius: 8 }]}
        onPress={handlePassportPress}
      >
        <Feather name="globe" size={20} color={passportActive ? theme.primary : theme.text} />
      </Pressable>

      <Pressable
        style={styles.headerIconButton}
        onPress={() => navigation.navigate("LoveRadar")}
      >
        <Feather name="target" size={22} color={theme.primary} />
      </Pressable>

      <Pressable
        style={styles.headerIconButton}
        onPress={() => navigation.navigate('Filters')}
      >
        <Feather name="sliders" size={20} color={theme.text} />
      </Pressable>
    </View>
  );

  const resetCardPosition = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    cardRotation.value = 0;
    cardScale.value = 1;
    cardOpacity.value = 1;
    setIsAnimating(false);
  }, [translateX, translateY, cardRotation, cardScale, cardOpacity]);

  const advanceToNextProfile = useCallback(() => {
    const currentUser = users[currentIndex];
    if (currentUser) {
      userHistory.current.push(currentUser);
      if (userHistory.current.length > 10) {
        userHistory.current.shift();
      }
    }
    resetCardPosition();
    setIsAnimating(false);

    const remaining = users.length - currentIndex - 1;

    // Pre-warm the next 2 photos in the deck so they show instantly when the
    // card flips into view.
    try {
      const next = users.slice(currentIndex + 1, currentIndex + 3);
      const nextPhotos = next.map(u => u.photos?.[0]).filter(Boolean) as string[];
      if (nextPhotos.length > 0) Image.prefetch(nextPhotos).catch(() => {});
    } catch {}

    // Background-prefetch the NEXT batch when only 4 cards remain. The cards
    // are appended to the existing deck so the user keeps swiping smoothly
    // instead of seeing a refresh / spinner at the end.
    if (remaining <= 4 && !prefetchInFlightRef.current && users.length > 0) {
      prefetchInFlightRef.current = true;
      loadPotentialMatches(true /* silent */, true /* append */);
    }

    if (currentIndex < users.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Truly out of cards in memory. Trigger a foreground load so the user
      // sees the empty/loading state cleanly. The prefetch above usually
      // means we never actually reach this branch.
      setCurrentIndex(0);
      loadPotentialMatches();
    }
  }, [currentIndex, users, resetCardPosition, loadPotentialMatches]);

  useEffect(() => { setCardPhotoIndex(0); }, [currentIndex]);

  const handleLikeAction = useCallback(async (targetUser: DiscoverUser) => {
    if (!user || !token) return;
    
    try {
      const response = await api.post<{ success: boolean; isMatch?: boolean; friendRequest?: any; matchedUser?: any; message?: string }>(
        '/friends/request',
        { receiverId: targetUser.id },
        token
      );

      if (response.success) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        
        if (response.data?.isMatch) {
          navigation.navigate('MatchPopup', {
            currentUser: {
              id: user.id,
              name: user.name,
              photos: user.photos || []
            },
            matchedUser: {
              id: targetUser.id,
              name: targetUser.name,
              photos: targetUser.photos || []
            },
            isSuperLike: false
          });
        }
      }
    } catch (error: any) {
      const errMsg = error?.message || error?.response?.data?.message || '';
      if (errMsg.toLowerCase().includes('daily swipe limit') || errMsg.toLowerCase().includes('swipe limit')) {
        // Show the in-screen gate so the user sees a clear upgrade prompt
        // instead of just a dismissible alert.
        setDailyLimitReached(true);
      } else if (errMsg.includes('already sent')) {
        showAlert('Already Sent', `You've already sent a request to ${targetUser.name}`, [{ text: 'OK', style: 'default' }], 'info');
      } else {
        logger.error("Error sending match request:", error);
      }
    }
  }, [user, token, api, showAlert, navigation]);

  const handlePassAction = useCallback(async (targetUser: DiscoverUser) => {
    if (!token) return;
    
    try {
      await api.post('/match/swipe', { targetUserId: targetUser.id, action: 'pass' }, token);
    } catch (error) {
      logger.error("Error recording pass:", error);
    }
  }, [token, api]);

  const handleSwipeComplete = useCallback((direction: 'left' | 'right') => {
    const targetUser = users[currentIndex];
    if (!targetUser) return;
    
    seenUserIds.current.add(targetUser.id);
    
    if (direction === 'right') {
      handleLikeAction(targetUser);
    } else {
      handlePassAction(targetUser);
    }
    advanceToNextProfile();
  }, [users, currentIndex, handleLikeAction, handlePassAction, advanceToNextProfile]);

  const animateSwipe = useCallback((direction: 'left' | 'right') => {
    if (isAnimating || currentIndex >= users.length) return;
    setIsAnimating(true);
    
    const targetX = direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5;
    translateX.value = withTiming(targetX, { 
      duration: 300,
      easing: Easing.out(Easing.ease)
    }, () => {
      runOnJS(handleSwipeComplete)(direction);
    });
    cardRotation.value = withTiming(direction === 'right' ? 15 : -15, { duration: 300 });
    cardScale.value = withTiming(0.9, { duration: 150 });
  }, [isAnimating, currentIndex, users.length, translateX, cardRotation, cardScale, handleSwipeComplete]);

  const handleLike = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    likeButtonScale.value = withSequence(
      withTiming(1.5, { duration: 100 }),
      withSpring(1)
    );
    animateSwipe('right');
  }, [animateSwipe, likeButtonScale]);

  const handlePass = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    actionButtonScale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withSpring(1)
    );
    animateSwipe('left');
  }, [animateSwipe, actionButtonScale]);

  const handleMessage = useCallback(() => {
    if (currentIndex >= users.length) return;
    const targetUser = users[currentIndex];
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    messageButtonScale.value = withSequence(
      withTiming(0.9, { duration: 100 }),
      withSpring(1, { damping: 10 })
    );
    navigation.navigate("ChatDetail", { userId: targetUser.id, userName: targetUser.name });
  }, [currentIndex, users, navigation, messageButtonScale]);

  const handleViewProfile = useCallback(() => {
    if (currentIndex >= users.length) return;
    const targetUser = users[currentIndex];
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    navigation.navigate("ProfileDetail", { userId: targetUser.id });
  }, [currentIndex, users, navigation]);

  // Stored as a ref so the blend effect dep array only uses primitives.
  const userFavSongRef = useRef<any>((user as any)?.favoriteSong);
  useEffect(() => { userFavSongRef.current = (user as any)?.favoriteSong; }, [(user as any)?.favoriteSong]);

  useEffect(() => {
    if (loading || isAnimating) return;
    const cur = users[currentIndex];
    if (!cur) return;
    if (blendShownIds.current.has(cur.id)) return;

    const shared = cur.sharedInterests || [];
    const score = cur.similarityScore || 0;

    const mySong = userFavSongRef.current;
    const theirSong = cur.favoriteSong;
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    let songMatch: { type: 'song' | 'artist'; title?: string; artist?: string; albumArt?: string } | undefined;
    if (mySong && theirSong) {
      const sameTitle = !!norm(mySong.title) && norm(mySong.title) === norm(theirSong.title);
      const sameArtist = !!norm(mySong.artist) && norm(mySong.artist) === norm(theirSong.artist);
      if (sameTitle && sameArtist) {
        songMatch = { type: 'song', title: theirSong.title, artist: theirSong.artist, albumArt: theirSong.albumArt };
      } else if (sameArtist) {
        songMatch = { type: 'artist', artist: theirSong.artist, albumArt: theirSong.albumArt };
      }
    }

    const hasInterestBlend = shared.length >= 3 && score >= 65;
    const hasSongBlend = !!songMatch;

    if (hasInterestBlend || hasSongBlend) {
      blendShownIds.current.add(cur.id);
      setBlendMatch({ user: cur, shared, songMatch });
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
  // Replace `user` (whole object, changes every context update) with just the
  // two primitives that actually matter for the blend calculation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, users, loading, isAnimating]);

  const handleBlendLike = useCallback(() => {
    if (!blendMatch) return;
    setBlendMatch(null);
    setTimeout(() => handleLike(), 50);
  }, [blendMatch]);

  const handleRewind = useCallback(async () => {
    if (userHistory.current.length === 0) {
      showAlert('No History', 'No previous profiles to rewind to', [{ text: 'OK', style: 'default' }], 'alert-circle');
      return;
    }
    if (!user?.premium?.isActive) {
      showAlert(
        'Premium Feature',
        'Rewind is available for Premium members. Upgrade to undo your last swipe!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', style: 'default', onPress: () => navigation.navigate('Premium') }
        ],
        'rotate-ccw'
      );
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    rewindButtonScale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withSpring(1, { damping: 10 })
    );
    try {
      await api.post('/match/rewind', {}, token || '');
    } catch (error) {
      logger.error('Rewind API error:', error);
    }
    const previousUser = userHistory.current.pop();
    if (previousUser) {
      seenUserIds.current.delete(previousUser.id);
      if (currentIndex > 0) {
        setUsers(prev => {
          const newUsers = [...prev];
          newUsers.splice(currentIndex, 0, previousUser);
          return newUsers;
        });
      } else {
        setUsers(prev => [previousUser, ...prev]);
      }
      translateX.value = withSequence(
        withTiming(-SCREEN_WIDTH, { duration: 0 }),
        withSpring(0, { damping: 15 })
      );
    }
  }, [currentIndex, rewindButtonScale, translateX, showAlert, user?.premium?.isActive, navigation, api, token]);

  const playSuperLikeAnimation = useCallback(() => {
    setShowSuperLikeAnimation(true);
    superLikeScale.value = 0;
    superLikeOpacity.value = 1;
    superLikeRotation.value = -30;
    
    superLikeScale.value = withSequence(
      withSpring(1.5, { damping: 8, stiffness: 200 }),
      withDelay(300, withTiming(2, { duration: 200 }))
    );
    superLikeRotation.value = withSequence(
      withSpring(0, { damping: 10 }),
      withDelay(300, withTiming(15, { duration: 200 }))
    );
    superLikeOpacity.value = withDelay(400, withTiming(0, { duration: 300 }, () => {
      runOnJS(setShowSuperLikeAnimation)(false);
    }));
  }, [superLikeScale, superLikeOpacity, superLikeRotation]);

  const handleSuperLike = useCallback(async () => {
    if (currentIndex >= users.length) return;
    const targetUser = users[currentIndex];
    
    if (!user?.premium?.isActive) {
      showAlert(
        'Premium Feature', 
        'Super Like is available for Premium members. Upgrade to stand out and show extra interest!', 
        [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Upgrade', style: 'default', onPress: () => navigation.navigate('Subscription' as any) }
        ], 
        'star'
      );
      return;
    }
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    starButtonScale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withSpring(1, { damping: 10 })
    );
    
    playSuperLikeAnimation();
    
    try {
      const response = await api.post<{ success: boolean; isMatch?: boolean; message?: string }>(
        '/match/swipe',
        { targetUserId: targetUser.id, action: 'superlike' },
        token || ''
      );
      
      const responseData = response.data as any;
      
      if (!response.success || !responseData?.success) {
        showAlert('Error', responseData?.message || 'Failed to send super like. Please try again.', [{ text: 'OK', style: 'default' }], 'alert-circle');
        return;
      }
      
      if (responseData?.isMatch) {
        // Use the full animated MatchPopup screen (same as regular likes),
        // with isSuperLike=true so it can style itself differently.
        setTimeout(() => {
          navigation.navigate('MatchPopup', {
            currentUser: {
              id: user!.id,
              name: user!.name,
              photos: user!.photos || [],
            },
            matchedUser: {
              id: targetUser.id,
              name: targetUser.name,
              photos: targetUser.photos || [],
            },
            isSuperLike: true,
          });
        }, 600);
      } else {
        setTimeout(() => {
          showAlert('Super Like Sent!', `${targetUser.name} will know you super liked them!`, [{ text: 'OK', style: 'default' }], 'star');
        }, 600);
      }
      
      setTimeout(() => animateSwipe('right'), 500);
    } catch (error: any) {
      logger.error("Super like error:", error);
      const errMsg = error?.message || error?.response?.data?.message || '';
      if (errMsg.includes('Daily swipe limit') || errMsg.includes('swipe limit')) {
        showAlert(
          'Out of Likes',
          "You've used all 10 daily likes. Upgrade to Premium for unlimited likes!",
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Upgrade', style: 'default', onPress: () => navigation.navigate('Premium') }
          ],
          'heart'
        );
      } else {
        showAlert('Error', 'Something went wrong. Please try again.', [{ text: 'OK', style: 'default' }], 'alert-circle');
      }
    }
  }, [currentIndex, users, token, api, starButtonScale, animateSwipe, showAlert, navigation, playSuperLikeAnimation, user?.premium?.isActive]);

  const handleShareLocation = useCallback(async () => {
    if (!token) return;
    
    try {
      setLocationLoading(true);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      
      const status = await requestAndCachePermission();

      if (status !== 'granted') {
        setHasLocationPermission(false);
        setLocationPermissionChecked(true);
        showAlert(t('locationRequired'), t('enableLocationAccess'), [{ text: t('ok'), style: 'default' }], 'map-pin');
        setLocationLoading(false);
        return;
      }

      setHasLocationPermission(true);
      setLocationPermissionChecked(true);
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      if (!location?.coords?.latitude || !location?.coords?.longitude) {
        showAlert(t('error'), t('locationError'), [{ text: t('ok'), style: 'default' }], 'alert-circle');
        setLocationLoading(false);
        return;
      }
      
      const coords = {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      };
      
      const response = await api.put<{ success: boolean }>(
        '/users/me',
        { location: coords },
        token
      );
      
      if (response.success) {
        await updateProfile({ location: coords });
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        // Drop the gate immediately and reset the preferences ref so the
        // initial-load useEffect re-fires once `user.location.lat/lng` flips
        // in. Calling `loadPotentialMatches()` directly here would use the
        // stale memoized closure (without the new coords) and re-trigger the
        // requiresLocation gate, which is the bug new users hit on signup.
        setRequiresLocation(false);
        preferencesRef.current = '';
        setLoading(true);
        showAlert(t('success'), t('locationUpdated'), [{ text: t('ok'), style: 'default' }], 'check-circle');
      }
    } catch (error) {
      logger.error('Location sharing error:', error);
      showAlert(t('error'), t('locationError'), [{ text: t('ok'), style: 'default' }], 'alert-circle');
    } finally {
      setLocationLoading(false);
    }
  }, [token, api, updateProfile, loadPotentialMatches, t, showAlert]);

  const panGesture = Gesture.Pan()
    .enabled(!isAnimating)
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY * 0.5;
      cardRotation.value = interpolate(
        event.translationX,
        [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
        [-15, 0, 15]
      );
      cardScale.value = interpolate(
        Math.abs(event.translationX),
        [0, SCREEN_WIDTH / 2],
        [1, 0.95]
      );
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > SWIPE_THRESHOLD) {
        const direction = event.translationX > 0 ? 'right' : 'left';
        runOnJS(animateSwipe)(direction);
      } else {
        translateX.value = withSpring(0, { damping: 15 });
        translateY.value = withSpring(0, { damping: 15 });
        cardRotation.value = withSpring(0, { damping: 15 });
        cardScale.value = withSpring(1, { damping: 15 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${cardRotation.value}deg` },
      { scale: cardScale.value },
    ],
    opacity: cardOpacity.value,
  }));

  const likeOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD], [0, 1]),
  }));

  const passOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD, 0], [1, 0]),
  }));

  const passButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: actionButtonScale.value }],
  }));

  const likeButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeButtonScale.value }],
  }));

  const messageButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: messageButtonScale.value }],
  }));

  const rewindButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rewindButtonScale.value }],
  }));

  const starButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: starButtonScale.value }],
  }));

  const superLikeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: superLikeScale.value },
      { rotate: `${superLikeRotation.value}deg` },
    ],
    opacity: superLikeOpacity.value,
  }));

  const currentUser = users[currentIndex];
  const nextUser = users[currentIndex + 1];

  if (loading) {
    // Lightweight loader instead of the heavy radar-pulse skeleton.
    // The skeleton used three reanimated shared values + withRepeat that ran
    // every frame on cold open, slowed first paint, and could end up showing
    // for 200-400ms before cards arrived. A single ActivityIndicator paints
    // instantly and gets out of the way the moment /users/nearby resolves.
    // Cached-deck users skip this branch entirely (loading is set false
    // synchronously after AsyncStorage hydration).
    return (
      <GestureHandlerRootView style={styles.container}>
        <ThemedView style={[styles.container, styles.centerContent]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </ThemedView>
      </GestureHandlerRootView>
    );
  }

  // ── Face verification gate ───────────────────────────────────────────────
  if (faceGateStatus === 'loading') {
    return (
      <GestureHandlerRootView style={styles.container}>
        <ThemedView style={[styles.container, styles.centerContent]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </ThemedView>
      </GestureHandlerRootView>
    );
  }

  if (faceGateStatus !== 'approved') {
    const isPending  = faceGateStatus === 'pending';
    const isRejected = faceGateStatus === 'rejected';

    const gateTitle = isPending
      ? 'Verification under review'
      : isRejected
        ? 'Verification failed'
        : 'Verify your face before seeing users';

    const gateSubtitle = isPending
      ? 'Our team is reviewing your submission. You\'ll be notified once it\'s approved — usually within 24 hours.'
      : isRejected
        ? 'Your verification was not approved. Please try again with a clearer video in good lighting.'
        : 'To protect our community, you need to complete face verification before discovering and interacting with other users.';

    const gateIcon: any = isPending ? 'clock' : isRejected ? 'x-circle' : 'shield';
    const gateIconColor = isPending ? '#F59E0B' : isRejected ? '#EF4444' : theme.primary;
    const gateBgColor   = isPending ? '#FEF3C7' : isRejected ? '#FEE2E2' : theme.primary + '18';

    return (
      <GestureHandlerRootView style={styles.container}>
        <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
            {/* Icon circle */}
            <View style={{
              width: 100, height: 100, borderRadius: 50,
              backgroundColor: gateBgColor,
              justifyContent: 'center', alignItems: 'center',
              marginBottom: 28,
            }}>
              <Feather name={gateIcon} size={44} color={gateIconColor} />
            </View>

            {/* Title */}
            <ThemedText style={{
              fontSize: 22, fontWeight: '800', textAlign: 'center',
              color: theme.text, marginBottom: 14, lineHeight: 30,
            }}>
              {gateTitle}
            </ThemedText>

            {/* Subtitle */}
            <ThemedText style={{
              fontSize: 15, textAlign: 'center', lineHeight: 22,
              color: theme.textSecondary, marginBottom: 36,
            }}>
              {gateSubtitle}
            </ThemedText>

            {/* Status pill */}
            <View style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
              backgroundColor: gateBgColor, marginBottom: 32,
              flexDirection: 'row', alignItems: 'center', gap: 6,
            }}>
              <View style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: gateIconColor,
              }} />
              <ThemedText style={{ fontSize: 13, fontWeight: '700', color: gateIconColor }}>
                {isPending ? 'Under Review' : isRejected ? 'Rejected' : 'Not Verified'}
              </ThemedText>
            </View>

            {/* CTA */}
            {!isPending && (
              <Pressable
                onPress={() => navigation.navigate('Verification')}
                style={({ pressed }) => ({
                  backgroundColor: theme.primary,
                  paddingVertical: 16, paddingHorizontal: 40,
                  borderRadius: 50, opacity: pressed ? 0.85 : 1,
                  shadowColor: theme.primary, shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
                })}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.3 }}>
                  {isRejected ? 'Try Again' : 'Verify Now'}
                </ThemedText>
              </Pressable>
            )}

            {isPending && (
              <Pressable
                onPress={() => { checkFaceGate(); fetchUser().catch(() => {}); }}
                style={({ pressed }) => ({
                  borderWidth: 2, borderColor: theme.primary,
                  paddingVertical: 14, paddingHorizontal: 36,
                  borderRadius: 50, opacity: pressed ? 0.75 : 1,
                })}
              >
                <ThemedText style={{ color: theme.primary, fontWeight: '700', fontSize: 15 }}>
                  Refresh Status
                </ThemedText>
              </Pressable>
            )}
          </View>
        </ThemedView>
      </GestureHandlerRootView>
    );
  }
  // ─── End face gate ────────────────────────────────────────────────────────

  if (requiresLocation && !currentUser) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <ThemedView style={[styles.container, styles.centerContent]}>
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.primary + '20' }]}>
                <Feather name="map-pin" size={48} color={theme.primary} />
              </View>
            </View>

            <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>
              Enable location to start discovering
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              We use your location to show you people nearby. Your exact coordinates are never shared with other users — only an approximate distance.
            </ThemedText>

            <View style={styles.emptyButtonsContainer}>
              <Pressable
                style={[styles.emptyRefreshButton, { backgroundColor: theme.primary, opacity: locationLoading ? 0.7 : 1 }]}
                onPress={handleShareLocation}
                disabled={locationLoading}
              >
                <Feather name="map-pin" size={18} color="#FFF" />
                <ThemedText style={styles.emptyRefreshButtonText}>
                  {locationLoading ? 'Enabling…' : 'Enable Location'}
                </ThemedText>
              </Pressable>

              {user?.premium?.isActive && (
                <Pressable
                  style={[styles.loveRadarButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.primary }]}
                  onPress={() => {
                    // Reset retry guard, clear location gate, switch mode.
                    // Do NOT call loadPotentialMatches() directly here — the
                    // stale closure would still have discoveryType='local'.
                    // The preferencesRef useEffect detects the state change
                    // and fires the correct global fetch automatically.
                    hasAutoRetriedRef.current = false;
                    setRequiresLocation(false);
                    setDiscoveryType('global');
                    setLoading(true);
                  }}
                >
                  <Feather name="globe" size={18} color={theme.primary} />
                  <ThemedText style={[styles.loveRadarButtonText, { color: theme.primary }]}>
                    Browse Globally
                  </ThemedText>
                </Pressable>
              )}
            </View>

            <Pressable
              style={styles.emptySettingsLink}
              onPress={() => navigation.navigate("Settings")}
            >
              <Feather name="sliders" size={16} color={theme.textSecondary} />
              <ThemedText style={[styles.emptySettingsText, { color: theme.textSecondary }]}>
                Open settings
              </ThemedText>
            </Pressable>
          </View>
          <AlertComponent />
        </ThemedView>
      </GestureHandlerRootView>
    );
  }

  // ─── Daily like-limit gate ───────────────────────────────────────────────
  if (dailyLimitReached && !showPassportModal && !showSecondChance && !showCountryPicker) {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msLeft = midnight.getTime() - now.getTime();
    const hoursLeft = Math.floor(msLeft / 3_600_000);
    const minsLeft  = Math.floor((msLeft % 3_600_000) / 60_000);
    const resetLabel = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft} min`;

    return (
      <GestureHandlerRootView style={styles.container}>
        <ThemedView style={[styles.container, styles.centerContent]}>
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: '#FF4D4D20' }]}>
                <Feather name="heart" size={48} color="#FF4D4D" />
              </View>
            </View>

            <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>
              Out of Likes for Today
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              You've used all 10 daily likes. Free likes reset in {resetLabel}.{'\n'}Upgrade to Premium for unlimited likes every day.
            </ThemedText>

            <View style={styles.emptyButtonsContainer}>
              <Pressable
                style={[styles.emptyRefreshButton, { backgroundColor: theme.primary }]}
                onPress={() => navigation.navigate('Premium' as any)}
              >
                <Feather name="star" size={18} color="#FFF" />
                <ThemedText style={styles.emptyRefreshButtonText}>Upgrade to Premium</ThemedText>
              </Pressable>

              <Pressable
                style={[styles.loveRadarButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
                onPress={() => setDailyLimitReached(false)}
              >
                <Feather name="eye" size={18} color={theme.textSecondary} />
                <ThemedText style={[styles.loveRadarButtonText, { color: theme.textSecondary }]}>Keep Browsing</ThemedText>
              </Pressable>
            </View>

            <View style={[styles.emptyOptionCard, { backgroundColor: '#FFF3E022', borderColor: '#FFB80040', marginTop: 8 }]}>
              <View style={[styles.emptyOptionIcon, { backgroundColor: '#FFB80018' }]}>
                <Feather name="info" size={20} color="#FFB800" />
              </View>
              <View style={styles.emptyOptionText}>
                <ThemedText style={[styles.emptyOptionTitle, { color: theme.text }]}>Premium perks</ThemedText>
                <ThemedText style={[styles.emptyOptionDesc, { color: theme.textSecondary }]}>Unlimited likes · Global discovery · See who liked you · Passport</ThemedText>
              </View>
            </View>
          </View>
          <AlertComponent />
        </ThemedView>
      </GestureHandlerRootView>
    );
  }
  // ─── End daily limit gate ─────────────────────────────────────────────────

  if (!currentUser && !showPassportModal && !showSecondChance && !showCountryPicker) {
    return (
      <GestureHandlerRootView style={styles.container}>
        <ThemedView style={[styles.container, styles.centerContent]}>
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyIconContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.primary + '20' }]}>
                <Feather name="users" size={48} color={theme.primary} />
              </View>
            </View>

            <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>
              {t('noMoreProfiles')}
            </ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              {t('noMoreProfilesDescription')}
            </ThemedText>

            <View style={styles.emptyButtonsContainer}>
              <Pressable
                style={[styles.emptyRefreshButton, { backgroundColor: theme.primary }]}
                onPress={() => {
                  resetDiscoverySession();
                  setLoading(true);
                  loadPotentialMatchesRef.current?.();
                }}
              >
                <Feather name="refresh-cw" size={18} color="#FFF" />
                <ThemedText style={styles.emptyRefreshButtonText}>{t('refresh')}</ThemedText>
              </Pressable>

              <Pressable
                style={[styles.loveRadarButton, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.primary }]}
                onPress={() => navigation.navigate("LoveRadar")}
              >
                <Feather name="target" size={18} color={theme.primary} />
                <ThemedText style={[styles.loveRadarButtonText, { color: theme.primary }]}>{t('openLoveRadar')}</ThemedText>
              </Pressable>
            </View>

            <Pressable
              style={styles.emptySettingsLink}
              onPress={() => navigation.navigate('Filters')}
            >
              <Feather name="sliders" size={16} color={theme.textSecondary} />
              <ThemedText style={[styles.emptySettingsText, { color: theme.textSecondary }]}>
                Adjust Filters
              </ThemedText>
            </Pressable>
          </View>
          <AlertComponent />
        </ThemedView>
      </GestureHandlerRootView>
    );
  }

  const getValidPhotoSource = (photos: any[], index = 0) => {
    if (!photos || photos.length === 0) {
      return require("@/assets/images/placeholder-1.webp");
    }
    const photo = photos[Math.min(index, photos.length - 1)];
    const source = getPhotoSource(photo);
    if (!source) {
      return require("@/assets/images/placeholder-1.webp");
    }
    return source;
  };
  
  const photoSource = getValidPhotoSource(currentUser.photos, cardPhotoIndex);
  const nextPhotoSource = nextUser ? getValidPhotoSource(nextUser.photos) : require("@/assets/images/placeholder-1.webp");
  const displayInterests = currentUser.interests?.slice(0, 5) || [];

  const getInterestIcon = (interest: string): keyof typeof Feather.glyphMap => {
    const lowerInterest = interest.toLowerCase();
    if (lowerInterest.includes('smoke') || lowerInterest.includes('smoking')) return 'wind';
    if (lowerInterest.includes('drink') || lowerInterest.includes('alcohol')) return 'coffee';
    if (lowerInterest.includes('dog') || lowerInterest.includes('pet')) return 'heart';
    if (lowerInterest.includes('cat')) return 'heart';
    if (lowerInterest.includes('music')) return 'music';
    if (lowerInterest.includes('travel')) return 'map';
    if (lowerInterest.includes('food') || lowerInterest.includes('cook')) return 'coffee';
    if (lowerInterest.includes('sport') || lowerInterest.includes('gym') || lowerInterest.includes('fitness')) return 'activity';
    if (lowerInterest.includes('read') || lowerInterest.includes('book')) return 'book-open';
    if (lowerInterest.includes('movie') || lowerInterest.includes('film')) return 'film';
    if (lowerInterest.includes('game') || lowerInterest.includes('gaming')) return 'monitor';
    if (lowerInterest.includes('photo')) return 'camera';
    if (lowerInterest.includes('art') || lowerInterest.includes('paint')) return 'edit-3';
    if (lowerInterest.includes('dance')) return 'music';
    if (lowerInterest.includes('yoga') || lowerInterest.includes('meditation')) return 'sun';
    return 'star';
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
        {renderHeader()}

        {passportActive && (
          <View style={[styles.passportBadge, { backgroundColor: theme.primary }]}>
            <Feather name="globe" size={14} color="#FFF" />
            <ThemedText style={styles.passportBadgeText}>Passport Active: {passportCity}</ThemedText>
            <Pressable onPress={handleClearPassport}>
              <Feather name="x" size={16} color="#FFF" />
            </Pressable>
          </View>
        )}

        {discoveryType === 'global' && (
          <View style={[styles.passportBadge, { backgroundColor: theme.primary }]}>
            <Feather name="globe" size={14} color="#FFF" />
            <ThemedText style={styles.passportBadgeText}>
              {selectedCountry ? `Global: ${selectedCountry}` : 'Global: All Countries'}
            </ThemedText>
            <Pressable onPress={() => { fetchCountries(); setShowCountryPicker(true); }}>
              <Feather name="edit-2" size={14} color="#FFF" />
            </Pressable>
            <Pressable onPress={() => {
              resetDiscoverySession();
              setDailyLimitReached(false);
              setDiscoveryType('local');
              setSelectedCountry(null);
              setUsers([]);
              setLoading(true);
            }}>
              <Feather name="x" size={16} color="#FFF" />
            </Pressable>
          </View>
        )}

        <Modal
          visible={showCountryPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowCountryPicker(false)}
        >
          <View style={styles.passportModalOverlay}>
            <View style={[styles.passportModalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.passportModalHeader}>
                <ThemedText style={[styles.passportModalTitle, { color: theme.text }]}>
                  Choose a Country
                </ThemedText>
                <Pressable onPress={() => setShowCountryPicker(false)}>
                  <Feather name="x" size={24} color={theme.text} />
                </Pressable>
              </View>
              <ScrollView style={styles.passportCityList}>
                <Pressable
                  style={[
                    styles.passportCityItem,
                    { borderBottomColor: theme.border },
                    selectedCountry === null && { backgroundColor: theme.primary + '15' }
                  ]}
                  onPress={() => handleSelectCountry(null)}
                >
                  <View>
                    <ThemedText style={[styles.passportCityName, { color: theme.text }]}>All Countries</ThemedText>
                    <ThemedText style={[styles.passportCityCountry, { color: theme.textSecondary }]}>Show users worldwide</ThemedText>
                  </View>
                  {selectedCountry === null && discoveryType === 'global' && <Feather name="check" size={20} color={theme.primary} />}
                </Pressable>
                {(countries.length > 0 ? countries : FALLBACK_COUNTRIES).map((country) => (
                  <Pressable
                    key={country}
                    style={[
                      styles.passportCityItem,
                      { borderBottomColor: theme.border },
                      selectedCountry === country && { backgroundColor: theme.primary + '15' }
                    ]}
                    onPress={() => handleSelectCountry(country)}
                  >
                    <View>
                      <ThemedText style={[styles.passportCityName, { color: theme.text }]}>{country}</ThemedText>
                    </View>
                    {selectedCountry === country && <Feather name="check" size={20} color={theme.primary} />}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showPassportModal}
          transparent
          animationType="slide"
          onRequestClose={() => { setShowPassportModal(false); setPassportSearch(''); }}
        >
          <View style={styles.passportModalOverlay}>
            <View style={[styles.passportModalContent, { backgroundColor: theme.surface }]}>
              <View style={styles.passportModalHeader}>
                <ThemedText style={[styles.passportModalTitle, { color: theme.text }]}>
                  Passport - Choose a City
                </ThemedText>
                <Pressable onPress={() => { setShowPassportModal(false); setPassportSearch(''); }}>
                  <Feather name="x" size={24} color={theme.text} />
                </Pressable>
              </View>
              <View style={[styles.passportSearchContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Feather name="search" size={16} color={theme.textSecondary} style={styles.passportSearchIcon} />
                <TextInput
                  style={[styles.passportSearchInput, { color: theme.text }]}
                  placeholder="Search cities..."
                  placeholderTextColor={theme.textSecondary}
                  value={passportSearch}
                  onChangeText={setPassportSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                />
              </View>
              <ScrollView style={styles.passportCityList} keyboardShouldPersistTaps="handled">
                {PASSPORT_CITIES.filter((city) => {
                  if (!passportSearch.trim()) return true;
                  const q = passportSearch.toLowerCase();
                  return city.name.toLowerCase().includes(q) || city.country.toLowerCase().includes(q);
                }).map((city) => (
                  <Pressable
                    key={city.name}
                    style={[
                      styles.passportCityItem,
                      { borderBottomColor: theme.border },
                      passportCity === city.name && { backgroundColor: theme.primary + '15' }
                    ]}
                    onPress={() => { handleSelectPassportCity(city); setPassportSearch(''); }}
                  >
                    <View>
                      <ThemedText style={[styles.passportCityName, { color: theme.text }]}>{city.name}</ThemedText>
                      <ThemedText style={[styles.passportCityCountry, { color: theme.textSecondary }]}>{city.country}</ThemedText>
                    </View>
                    {passportCity === city.name && <Feather name="check" size={20} color={theme.primary} />}
                  </Pressable>
                ))}
              </ScrollView>
              {passportActive && (
                <Pressable
                  style={[styles.passportClearButton, { borderColor: '#FF6B6B' }]}
                  onPress={handleClearPassport}
                >
                  <Feather name="map-pin" size={18} color="#FF6B6B" />
                  <ThemedText style={styles.passportClearText}>Clear Passport - Use Real Location</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        </Modal>

        {currentUser && <View style={styles.cardArea}>
        <View style={styles.cardWrapper}>
          {nextUser && (
            <View style={[styles.profileCard, styles.stackedCard]}>
              {nextPhotoSource ? (
                <Image
                  source={nextPhotoSource}
                  style={styles.profileImageFull}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.profileImageFull, styles.noPhotoContainer]}>
                  <Feather name="user" size={80} color="#666" />
                </View>
              )}
            </View>
          )}

          <GestureDetector gesture={panGesture}>
            <Animated.View style={[styles.profileCard, cardStyle]}>
              {photoSource ? (
                <Image
                  source={photoSource}
                  style={[styles.profileImageFull, (currentUser as any).needsVerification && { filter: 'blur(10px)' }]}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.profileImageFull, styles.noPhotoContainer]}>
                  <Feather name="user" size={80} color="#666" />
                </View>
              )}

              {currentUser.photos?.length > 1 && (
                <View style={styles.photoProgressRow} pointerEvents="none">
                  {currentUser.photos.map((_: any, i: number) => (
                    <View
                      key={i}
                      style={[
                        styles.photoProgressBar,
                        { backgroundColor: i === cardPhotoIndex ? '#fff' : 'rgba(255,255,255,0.35)' },
                      ]}
                    />
                  ))}
                </View>
              )}

              {currentUser.photos?.length > 1 && (
                <>
                  <Pressable
                    style={styles.photoTapLeft}
                    onPress={() => setCardPhotoIndex(i => Math.max(0, i - 1))}
                  />
                  <Pressable
                    style={styles.photoTapRight}
                    onPress={() => setCardPhotoIndex(i => Math.min(currentUser.photos.length - 1, i + 1))}
                  />
                </>
              )}

              {(currentUser as any).needsVerification && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }]}>
                  <View style={{ backgroundColor: theme.surface, padding: 16, borderRadius: 12, alignItems: 'center', margin: 20 }}>
                    <Feather name="shield-off" size={32} color={theme.primary} />
                    <ThemedText style={{ fontWeight: '700', marginTop: 12, textAlign: 'center' }}>Photo Under Verification</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: theme.textSecondary, marginTop: 4, textAlign: 'center' }}>This user's photo is being reviewed</ThemedText>
                  </View>
                </View>
              )}

              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.98)']}
                style={styles.cardGradient}
              />

              <Animated.View style={[styles.likeStamp, likeOpacity]}>
                <ThemedText style={[styles.stampText, { color: '#4CAF50' }]}>{t('like')}</ThemedText>
              </Animated.View>

              <Animated.View style={[styles.passStamp, passOpacity]}>
                <ThemedText style={[styles.stampText, { color: '#FF6B6B' }]}>{t('nope')}</ThemedText>
              </Animated.View>


              <Pressable
                style={styles.profileIconButton}
                onPress={handleViewProfile}
              >
                <Feather name="user" size={20} color="#FFF" />
              </Pressable>

              <View style={[styles.cardInfoOverlay, { zIndex: 10 }]}>
                {(() => {
                  const onlineStatus = (currentUser as any).onlineStatus;
                  const lastActive   = (currentUser as any).lastActive;
                  const isOnline     = onlineStatus === 'online';
                  const recentlyActive = !isOnline && lastActive &&
                    (Date.now() - new Date(lastActive).getTime()) < 24 * 60 * 60 * 1000;
                  if (!isOnline && !recentlyActive) return null;
                  return (
                    <View style={styles.activeBadge}>
                      <View style={[styles.activeDot, { backgroundColor: isOnline ? '#22c55e' : '#86efac' }]} />
                      <ThemedText style={styles.activeBadgeText}>
                        {isOnline ? 'Online now' : 'Active recently'}
                      </ThemedText>
                    </View>
                  );
                })()}
                <View style={styles.nameRow}>
                  <ThemedText style={styles.profileName} numberOfLines={1} adjustsFontSizeToFit={false}>
                    {currentUser.name?.split(' ')[0]}
                  </ThemedText>
                  {(currentUser as any).premium?.isActive && (
                    <PremiumBadge size="small" style={{ marginLeft: 5 }} />
                  )}
                  {currentUser.verified && (
                    <VerificationBadge size={22} />
                  )}
                  {currentUser.age != null && (
                    <ThemedText style={styles.profileAge}>, {currentUser.age}</ThemedText>
                  )}
                </View>

                {!!(currentUser as any).bio && (
                  <ThemedText style={styles.profileBio} numberOfLines={2}>
                    {(currentUser as any).bio}
                  </ThemedText>
                )}

                {(currentUser as any).location?.city && (
                  <View style={styles.locationRow}>
                    <Feather name="map-pin" size={13} color="rgba(255,255,255,0.7)" />
                    <ThemedText style={styles.locationText} numberOfLines={1}>
                      {(currentUser as any).location.city}{(currentUser as any).location.country ? `, ${(currentUser as any).location.country}` : ''}
                    </ThemedText>
                  </View>
                )}

                {(() => {
                  const distanceLabel = formatDistanceAway(currentUser, user);
                  if (!distanceLabel) return null;
                  return (
                    <View style={styles.locationRow}>
                      <Feather name="navigation" size={13} color="rgba(255,255,255,0.7)" />
                      <ThemedText style={styles.locationText} numberOfLines={1}>
                        {distanceLabel}
                      </ThemedText>
                    </View>
                  );
                })()}

                <View style={styles.lifestyleRow}>
                  {currentUser.religion && (
                    <View style={styles.lifestyleBadge}>
                      <ThemedText style={styles.lifestyleText}>{currentUser.religion}</ThemedText>
                    </View>
                  )}
                  {currentUser.personalityType && (
                    <View style={styles.lifestyleBadge}>
                      <ThemedText style={styles.lifestyleText}>{currentUser.personalityType}</ThemedText>
                    </View>
                  )}
                </View>

                {displayInterests.length > 0 && (
                  <View style={styles.tagsRow}>
                    {displayInterests.map((interest, index) => (
                      <View key={index} style={styles.tag}>
                        <Feather name={getInterestIcon(interest)} size={12} color="#FFF" />
                        <ThemedText style={styles.tagText}>{interest}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </Animated.View>
          </GestureDetector>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.72)']}
            style={styles.actionGradient}
            pointerEvents="none"
          />
          <View style={[styles.actionRow, { paddingBottom: insets.bottom + 16 }]}>
            <Animated.View style={rewindButtonStyle}>
              <Pressable
                style={[styles.rewindButton, { backgroundColor: isDark ? '#1e1e1e' : '#FFF' }, userHistory.current.length === 0 && styles.disabledButton]}
                onPress={handleRewind}
                disabled={isAnimating || userHistory.current.length === 0}
              >
                <Feather name="rotate-ccw" size={20} color="#f5d142" />
              </Pressable>
            </Animated.View>

            <Animated.View style={passButtonStyle}>
              <Pressable
                style={[styles.passButton, { backgroundColor: isDark ? '#1e1e1e' : '#FFF' }]}
                onPress={handlePass}
                disabled={isAnimating}
              >
                <Feather name="x" size={28} color="#FF6B6B" />
              </Pressable>
            </Animated.View>

            <Animated.View style={starButtonStyle}>
              <Pressable
                style={[styles.starButton, { backgroundColor: isDark ? '#1e1e1e' : '#FFF' }]}
                onPress={handleSuperLike}
                disabled={isAnimating}
              >
                <Feather name="star" size={28} color="#2196f3" />
              </Pressable>
            </Animated.View>

            <Animated.View style={likeButtonStyle}>
              <Pressable
                style={[styles.likeButton, { backgroundColor: isDark ? '#1e1e1e' : '#FFF' }]}
                onPress={handleLike}
                disabled={isAnimating}
              >
                <Feather name="heart" size={28} color="#FF6B6B" />
              </Pressable>
            </Animated.View>

            <Pressable
              style={[styles.boostButton, { backgroundColor: isDark ? '#1e1e1e' : '#FFF' }]}
              onPress={async () => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                try {
                  const response = await api.post<{ success: boolean; message: string }>('/boost/activate', { type: 'standard' }, token || '');
                  const data = response.data as any;
                  if (response.success && data?.success) {
                    showAlert('Boost Activated!', 'Your profile is now being featured to more users for 30 minutes!', [{ text: 'Great', style: 'default' }], 'zap');
                  } else if (data?.message?.includes('already have an active boost')) {
                    showAlert('Boost Active', 'You already have an active boost! Your profile is being featured to more users.', [{ text: 'OK', style: 'default' }], 'zap');
                  } else {
                    showAlert('Boost', data?.message || 'Failed to activate boost', [{ text: 'OK', style: 'default' }], 'info');
                  }
                } catch (error: any) {
                  logger.error("Boost error:", error);
                  const errorMsg = error?.response?.data?.message || error?.message || '';
                  if (errorMsg.includes('already have an active boost')) {
                    showAlert('Boost Active', 'You already have an active boost! Your profile is being featured to more users.', [{ text: 'OK', style: 'default' }], 'zap');
                  } else {
                    showAlert('Error', 'Failed to activate boost. Please try again.', [{ text: 'OK', style: 'default' }], 'alert-circle');
                  }
                }
              }}
            >
              <Feather name="zap" size={24} color="#a033ff" />
            </Pressable>
          </View>
        </View>
        </View>}

        {newUserFound && (
          <Animated.View 
            entering={SlideInDown.duration(300)}
            exiting={SlideOutUp.duration(300)}
            style={[styles.newUserBanner, { backgroundColor: theme.primary }]}
          >
            <Feather name="user-plus" size={16} color="#FFF" />
            <ThemedText style={styles.newUserBannerText}>New person found nearby!</ThemedText>
          </Animated.View>
        )}

        {showSuperLikeAnimation && (
          <View style={styles.superLikeOverlay} pointerEvents="none">
            <Animated.View style={[styles.superLikeAnimationContainer, superLikeAnimatedStyle]}>
              <View style={styles.superLikeStar}>
                <Feather name="star" size={80} color="#00D4FF" />
              </View>
              <ThemedText style={styles.superLikeText}>SUPER LIKE</ThemedText>
            </Animated.View>
          </View>
        )}
        <AlertComponent />

        <Modal
          visible={!!blendMatch}
          transparent
          animationType="slide"
          onRequestClose={() => setBlendMatch(null)}
          statusBarTranslucent
        >
          <BlendPopupPage
            blendMatch={blendMatch}
            currentUser={user}
            theme={theme}
            onClose={() => setBlendMatch(null)}
            onLike={handleBlendLike}
          />
        </Modal>

        <Modal
          visible={showSecondChance}
          transparent
          animationType="slide"
          onRequestClose={() => setShowSecondChance(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={[{ backgroundColor: theme.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <ThemedText style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>Second Chance 🔄</ThemedText>
                <Pressable onPress={() => setShowSecondChance(false)}>
                  <Feather name="x" size={24} color={theme.text} />
                </Pressable>
              </View>
              <ThemedText style={{ color: theme.textSecondary, marginBottom: 20, fontSize: 14 }}>
                People you may have swiped past. Give them another look!
              </ThemedText>

              {secondChanceLoading ? (
                <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
              ) : secondChanceProfiles.length === 0 ? (
                <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 40 }}>
                  <Feather name="rotate-ccw" size={48} color={theme.textSecondary} />
                  <ThemedText style={{ color: theme.textSecondary, marginTop: 16, textAlign: 'center' }}>
                    No second chances yet.{'\n'}Keep swiping to build your list!
                  </ThemedText>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {secondChanceProfiles.map(profile => {
                    const photo = profile.photos?.[0];
                    const photoSrc = photo ? (typeof photo === 'string' ? { uri: photo } : photo.url ? { uri: photo.url } : null) : null;
                    return (
                      <View key={profile._id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 10, backgroundColor: theme.surface }}>
                        <Pressable
                          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                          onPress={() => {
                            setSecondChanceProfiles(prev => prev.filter(p => p._id !== profile._id));
                            setShowSecondChance(false);
                            navigation.navigate('ProfileDetail', { userId: profile._id });
                          }}
                        >
                          {photoSrc ? (
                            <Image source={photoSrc} style={{ width: 60, height: 60, borderRadius: 30 }} contentFit="cover" />
                          ) : (
                            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: theme.backgroundSecondary, justifyContent: 'center', alignItems: 'center' }}>
                              <Feather name="user" size={28} color={theme.textSecondary} />
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <ThemedText style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{profile.name}, {profile.age}</ThemedText>
                            {profile.sharedInterests?.length > 0 && (
                              <ThemedText style={{ fontSize: 12, color: theme.primary, marginTop: 2 }}>
                                {profile.sharedInterests.slice(0, 3).join(' · ')}
                              </ThemedText>
                            )}
                          </View>
                        </Pressable>
                        <Pressable
                          onPress={() => handleSecondChancePass(profile)}
                          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.textSecondary, justifyContent: 'center', alignItems: 'center', marginRight: 8 }}
                        >
                          <Feather name="x" size={18} color={theme.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleSecondChanceLike(profile)}
                          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary, justifyContent: 'center', alignItems: 'center' }}
                        >
                          <Feather name="heart" size={18} color="#FFF" />
                        </Pressable>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </ThemedView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    height: Platform.OS === 'ios' ? 108 : 88,
    backgroundColor: 'transparent',
    zIndex: 100,
    gap: 4,
  },
  headerIconButton: {
    padding: 7,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  radarIconContainer: {
    position: 'relative',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarPing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
    borderRadius: 20,
    padding: 2,
    flex: 1,
    justifyContent: 'center',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 3,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '',
  },
  activeToggleText: {
    color: '#000',
    fontWeight: '700',
  },
  container: {
    flex: 1,
  },
  profileImageFull: {
    position: 'absolute',
    width: "100%",
    height: "100%",
    zIndex: 1,
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  loadingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  loadingTitle: {
    ...Typography.h2,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  loadingText: {
    ...Typography.body,
    textAlign: "center",
  },
  emptyStateContainer: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  emptyIconContainer: {
    marginBottom: Spacing.lg,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    ...Typography.h2,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    ...Typography.body,
    textAlign: "center",
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  emptyButtonsContainer: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  emptyRefreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  emptyRefreshButtonText: {
    ...Typography.bodyBold,
    color: "#FFF",
  },
  emptySettingsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  emptySettingsText: {
    ...Typography.body,
  },
  emptyExtraOptions: {
    width: "100%",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  emptyOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  emptyOptionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyOptionText: {
    flex: 1,
  },
  emptyOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  emptyOptionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    ...Shadow.medium,
  },
  refreshButtonText: {
    ...Typography.bodyBold,
    color: "#FFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFF",
  },
  headerProfileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  newUserBanner: {
    position: "absolute",
    top: 100,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    zIndex: 100,
  },
  newUserBannerText: {
    ...Typography.bodyBold,
    color: "#FFF",
  },
  superLikeOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },
  superLikeAnimationContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  superLikeStar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(0, 212, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00D4FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 20,
  },
  superLikeText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#00D4FF",
    marginTop: Spacing.md,
    letterSpacing: 3,
    textShadowColor: "rgba(0, 212, 255, 0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  cardArea: {
    flex: 1,
    marginHorizontal: 10,
    minHeight: 200,
  },
  cardWrapper: {
    flex: 1,
    position: 'relative',
  },
  profileCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
  },
  stackedCard: {
    transform: [{ scale: 0.95 }],
    opacity: 0.3,
  },
  noPhotoContainer: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A2A2A",
  },
  cardGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
  },
  likeStamp: {
    position: "absolute",
    top: 80,
    left: 24,
    borderWidth: 4,
    borderColor: "#4CAF50",
    borderRadius: 8,
    padding: Spacing.sm,
    transform: [{ rotate: "-15deg" }],
  },
  passStamp: {
    position: "absolute",
    top: 80,
    right: 24,
    borderWidth: 4,
    borderColor: "#FF6B6B",
    borderRadius: 8,
    padding: Spacing.sm,
    transform: [{ rotate: "15deg" }],
  },
  stampText: {
    fontSize: 32,
    fontWeight: "800",
  },
  cardInfoOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 100,
    zIndex: 10,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    flexWrap: 'nowrap',
    width: '100%',
    gap: 6,
  },
  profileName: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFF",
    paddingBottom: 4,
    lineHeight: 38,
    includeFontPadding: false,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  profileAge: {
    fontSize: 28,
    fontWeight: "400",
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginLeft: 8,
  },
  verifiedTick: {
    width: 22,
    height: 22,
    marginLeft: 6,
  },
  photoProgressRow: {
    position: 'absolute',
    top: 10,
    left: 8,
    right: 8,
    flexDirection: 'row',
    gap: 4,
    zIndex: 40,
  },
  photoProgressBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  photoTapLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '40%',
    bottom: 0,
    zIndex: 20,
  },
  photoTapRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '40%',
    bottom: 0,
    zIndex: 20,
  },
  profileBio: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    marginBottom: 8,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  actionGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 110,
    zIndex: 25,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
    gap: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 10,
  },
  locationText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "500",
  },
  verifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1DA1F2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  arrowUpButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#00D4FF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  basicsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  basicsIcon: {
    marginRight: 8,
  },
  basicsIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  basicsText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
    flex: 1,
  },
  basicsVerifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(29, 161, 242, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    gap: 4,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1DA1F2",
  },
  basicsChevron: {
    marginLeft: 4,
  },
  chevronContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  lifestyleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  lifestyleBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  lifestyleText: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.4,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  viewProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 30,
    alignSelf: "flex-start",
  },
  viewProfileButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
    letterSpacing: 0.3,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  profileIconButton: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  tagText: {
    fontSize: 13,
    color: "#FFF",
    fontWeight: "500",
  },
  actionRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 30,
  },
  rewindButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  passButton: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  starButton: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  likeButton: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  boostButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  messageButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(0, 212, 255, 0.15)",
    borderWidth: 2.5,
    borderColor: "#00D4FF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#00D4FF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  emptyRadarContainer: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  emptyRadarPulse: {
    position: "absolute",
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyRadarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    opacity: 0.3,
  },
  emptyRadarRingOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    opacity: 0.15,
  },
  emptyRadarCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.medium,
  },
  shareLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    ...Shadow.medium,
  },
  shareLocationButtonText: {
    ...Typography.bodyBold,
    color: "#FFF",
  },
  loveRadarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  loveRadarButtonText: {
    ...Typography.bodyBold,
  },
  passportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    gap: 6,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: 4,
  },
  passportBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  passportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  passportModalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    maxHeight: '70%',
  },
  passportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  passportModalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  passportSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
  },
  passportSearchIcon: {
    marginRight: 8,
  },
  passportSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  passportCityList: {
    paddingHorizontal: Spacing.lg,
  },
  passportCityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  passportCityName: {
    fontSize: 16,
    fontWeight: '600',
  },
  passportCityCountry: {
    fontSize: 13,
    marginTop: 2,
  },
  passportClearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  passportClearText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default function DiscoveryScreenWithBoundary(props: { navigation: any }) {
  return (
    <ErrorBoundary FallbackComponent={ScreenErrorFallback}>
      <DiscoveryScreen {...props} />
    </ErrorBoundary>
  );
}
