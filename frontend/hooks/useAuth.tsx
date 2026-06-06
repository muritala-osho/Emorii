import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useMemo } from "react";
import { Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { useApi } from "./useApi";
import socketService from "@/services/socket";
import { getApiBaseUrl } from "@/constants/config";
import logger from "@/utils/logger";
import { tokenManager, setOnSessionExpired, setOnTokenRefreshed, ACCESS_TOKEN_KEY } from "@/utils/tokenManager";

function getDeviceInfo(): { deviceName: string; platform: string } {
  const model = Device.modelName || "Unknown Device";
  const osName = Device.osName || (Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web");
  const osVersion = Device.osVersion || "";
  const deviceName = osVersion ? `${model} · ${osName} ${osVersion}` : `${model} · ${osName}`;
  const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  return { deviceName, platform };
}

export interface UserPhoto {
  _id?: string;
  url: string;
  publicId?: string;
  isPrimary?: boolean;
  privacy: 'public' | 'friends' | 'private';
  order?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  age: number;
  gender: string;
  bio: string;
  interests: string[];
  photos: UserPhoto[];
  location: { 
    type?: string;
    coordinates?: [number, number];
    lat?: number; 
    lng?: number;
    city?: string;
    country?: string;
  };
  lookingFor: string;
  preferences?: {
    ageRange?: { min: number; max: number };
    maxDistance?: number;
    genders?: string[];
    genderPreference?: string;
    language?: string;
    autoTranslate?: boolean;
  };
  favoriteSong?: {
    title: string;
    artist: string;
    spotifyUri?: string;
  };
  spotify?: {
    connected: boolean;
    displayName?: string;
  };
  zodiacSign?: string;
  jobTitle?: string;
  education?: string;
  school?: string;
  livingIn?: string;
  privacySettings?: {
    hideAge?: boolean;
    showOnlineStatus?: boolean;
    showDistance?: boolean;
    showLastActive?: boolean;
  };
  lifestyle?: {
    lookingFor?: string;
    religion?: string;
    drinking?: string;
    smoking?: string;
    workout?: string;
    pets?: string;
    hasKids?: boolean;
    hasPets?: boolean;
    wantsKids?: boolean;
    communicationStyle?: string;
    loveStyle?: string;
    personalityType?: string;
    ethnicity?: string;
    relationshipStatus?: string;
  };
  isFaceVerified?: boolean;
  verificationStatus?: 'none' | 'not_requested' | 'pending' | 'approved' | 'rejected';
  googleId?: string;
  isAdmin?: boolean;
  premium?: { isActive: boolean; plan: string; expiresAt?: string };
  needsVerification?: boolean;
  profileIncomplete?: boolean;
  height?: string | number;
  language?: string;
  religion?: string;
  ethnicity?: string;
  additionalLocations?: Array<{ city?: string; country?: string; coordinates?: [number, number] }>;
  settings?: Record<string, any>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isProfileComplete: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<{ userId: string; email: string }>;
  verifyOTP: (userId: string, otp: string) => Promise<{ needsProfileSetup: boolean }>;
  resendOTP: (userId: string) => Promise<void>;
  completeProfileSetup: (data: Partial<User>) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = ACCESS_TOKEN_KEY;
const USER_KEY = 'auth_user';
const PENDING_PROFILE_KEY = 'pending_profile_setup';
const LANGUAGE_SYNCED_KEY = 'app_language_synced';
const LANGUAGE_STORAGE_KEY = 'app_language_preference';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingProfileSetup, setPendingProfileSetup] = useState(false);
  const { post, put, get } = useApi();
  const clearAuthDataRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    loadAuthData();
  }, []);

  useEffect(() => {
    clearAuthDataRef.current = clearAuthData;
  });

  useEffect(() => {
    setOnSessionExpired(() => { clearAuthDataRef.current(); });
    return () => { setOnSessionExpired(null); };
  }, []);

  // Keep the React `token` state in sync whenever the token manager silently
  // refreshes the access token in the background. Without this, all code that
  // reads `token` from AuthContext would still carry the old expired value even
  // though SecureStore and useApi already have the fresh token.
  useEffect(() => {
    setOnTokenRefreshed((newToken: string) => {
      setToken(newToken);
    });
    return () => { setOnTokenRefreshed(null); };
  }, []);

  const userProfileComplete = useMemo(() => {
    const hasPhotos = !!user?.photos && Array.isArray(user.photos) && user.photos.length > 0;
    return !!user && hasPhotos;
  }, [user?.photos, user]);
  
  useEffect(() => {
    const uid = (user as any)?._id || user?.id;
    if (uid && token) {
      try {
        socketService.connect(token);
        socketService.setUserOnline(uid);

        const handleBanned = (data: { reason?: string }) => {
          Alert.alert(
            'Account Suspended',
            `Your account has been suspended${data?.reason ? `: ${data.reason}` : '.'}`,
            [{ text: 'OK', onPress: () => clearAuthData() }],
            { cancelable: false }
          );
        };
        const handleSuspended = (data: { days?: number; appealToken?: string; reason?: string; suspendedUntil?: string }) => {
          const goToAppeal = async () => {
            try {
              const { navigationRef } = require('@/utils/navigationRef');
              const nav: any = navigationRef;
              const params = {
                appealToken: data?.appealToken,
                email: (user as any)?.email,
                banReason: data?.reason || 'Violation of community guidelines',
                bannedAt: data?.suspendedUntil || new Date().toISOString(),
                appeal: null,
              };
              await clearAuthData();
              if (nav?.isReady?.()) {
                nav.navigate('AppealBanned', params);
              }
            } catch (_e) {
              await clearAuthData();
            }
          };
          Alert.alert(
            'Account Temporarily Suspended',
            `Your account has been suspended for ${data?.days ?? 'several'} day(s). You can submit an appeal.`,
            [
              { text: 'Appeal Now', onPress: goToAppeal },
              { text: 'Sign Out', style: 'cancel', onPress: () => clearAuthData() },
            ],
            { cancelable: false }
          );
        };

        const handleMessagingPaused = (data: { until?: string; reason?: string }) => {
          const untilStr = data?.until ? ` until ${new Date(data.until).toLocaleString()}` : '';
          Alert.alert(
            'Messaging Paused',
            `${data?.reason || 'Your messaging has been paused for safety review.'}${untilStr}`,
            [{ text: 'OK' }],
            { cancelable: true }
          );
        };
        const handleMessagingResumed = () => {
          Alert.alert('Messaging Resumed', 'You can now send messages again.', [{ text: 'OK' }]);
        };
        const handleSessionRevoked = (data: { reason?: string }) => {
          Alert.alert(
            'Device Removed',
            data?.reason || 'This device has been logged out remotely.',
            [{ text: 'OK', onPress: () => clearAuthData() }],
            { cancelable: false }
          );
        };

        socketService.on('user:banned', handleBanned);
        socketService.on('user:suspended', handleSuspended);
        socketService.on('session:revoked', handleSessionRevoked);
        socketService.on('user:messaging-paused', handleMessagingPaused);
        socketService.on('user:messaging-resumed', handleMessagingResumed);

        return () => {
          socketService.off('user:banned', handleBanned);
          socketService.off('user:suspended', handleSuspended);
          socketService.off('session:revoked', handleSessionRevoked);
          socketService.off('user:messaging-paused', handleMessagingPaused);
          socketService.off('user:messaging-resumed', handleMessagingResumed);
        };
      } catch (err) {
        logger.error('Socket connection failed:', err);
      }
    }
    return () => {};
  }, [user?.id, token]);

  const loadAuthData = async () => {
    try {
      const [storedToken, storedUser, pendingSetup] = await Promise.all([
        tokenManager.getAccessToken(),
        AsyncStorage.getItem(USER_KEY),
        AsyncStorage.getItem(PENDING_PROFILE_KEY),
      ]);

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        setPendingProfileSetup(pendingSetup === 'true');
        // Arm the silent-refresh timer for the persisted access token.
        // If the token is already expiring (or expired) the timer fires an
        // immediate refresh, so the first API call the app makes after
        // launch always carries a fresh token.
        tokenManager.armProactiveRefresh(storedToken);
      }
    } catch (error) {
      logger.error("Error loading auth data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAuthData = async (authToken: string, userData: User, refreshToken?: string | null) => {
    // Phase 1 — unblock the UI immediately.
    // Persist the token + login-response user and update React state right away
    // so the navigator transitions to the authenticated stack on the next render,
    // without waiting for an extra /api/users/me round-trip.
    await Promise.all([
      tokenManager.setAccessToken(authToken),
      refreshToken ? tokenManager.setRefreshToken(refreshToken) : Promise.resolve(),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(userData)),
    ]);
    setToken(authToken);
    setUser(userData);

    // Phase 2 — enrich user data in the background.
    // /api/users/me returns the full hydrated profile (photos, preferences, etc.)
    // which the login response may omit. We fetch it after the UI has already
    // navigated so the user never waits for this extra call.
    (async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const userResponse = await fetch(`${baseUrl}/api/users/me`, {
          headers: { 'Authorization': `Bearer ${authToken}` },
        });
        const userDataFull = await userResponse.json();
        if (userDataFull.success && userDataFull.user) {
          const finalUserData = userDataFull.user;
          // SAFETY: if the fresh /me response is missing photos (server blip,
          // partial response, photos query not populated), preserve the photos
          // we already have from the login response. Without this guard,
          // setUser() with empty photos makes isProfileComplete=false which
          // flips isAuthenticated to false and bounces the user to the login
          // screen even though their token is perfectly valid.
          if (
            (!finalUserData.photos || finalUserData.photos.length === 0) &&
            userData?.photos?.length > 0
          ) {
            finalUserData.photos = userData.photos;
          }
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(finalUserData));
          setUser(finalUserData);
          prefetchDiscovery(authToken, finalUserData).catch(() => {});
        } else {
          prefetchDiscovery(authToken, userData).catch(() => {});
        }
      } catch {
        prefetchDiscovery(authToken, userData).catch(() => {});
      }
    })();
  };

  // Background pre-fetch of the discovery deck. Writes the result into the
  // same AsyncStorage key (`discovery_cache_v1:<userId>`) that DiscoveryScreen
  // hydrates from on mount, so the first paint shows real cards instead of
  // a loading spinner. Silent on error — Discovery has its own fetch path.
  const prefetchDiscovery = async (authToken: string, userData: User) => {
    try {
      const baseUrl = getApiBaseUrl();
      const loc: any = userData.location || {};
      const lat = loc.lat ?? loc.coordinates?.coordinates?.[1] ?? loc.coordinates?.[1];
      const lng = loc.lng ?? loc.coordinates?.coordinates?.[0] ?? loc.coordinates?.[0];
      const params = new URLSearchParams({ limit: '30' });
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        params.set('lat', String(lat));
        params.set('lng', String(lng));
        const rawMax = userData.preferences?.maxDistance || 50;
        const maxD = userData.premium?.isActive ? rawMax : Math.min(rawMax, 50);
        params.set('maxDistance', String(maxD));
      }
      const res = await fetch(`${baseUrl}/api/users/nearby?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.success || !Array.isArray(data?.users) || data.users.length === 0) return;
      // Shape the payload to match what DiscoveryScreen.loadPotentialMatches
      // produces, so the hydrated deck renders immediately on first mount.
      const shaped = data.users.slice(0, 30).map((u: any) => {
        const userPhotos = u.photos && u.photos.length > 0 ? u.photos : (u.profilePhoto ? [u.profilePhoto] : []);
        const processedPhotos = userPhotos
          .map((p: any) => (typeof p === 'string' ? p : p?.url || null))
          .filter(Boolean);
        return {
          id: u._id || u.id,
          name: u.name || 'Unknown',
          age: u.age,
          bio: u.bio || '',
          photos: processedPhotos,
          interests: u.interests || [],
          online: u.online,
          distance: u.distance,
          similarityScore: 0,
          sharedInterests: [],
          gender: u.gender || 'male',
          verified: u.verified || false,
          location: u.location,
          isBoosted: u.isBoosted || false,
          needsVerification: u.needsVerification || false,
          premium: u.premium || undefined,
          favoriteSong: u.favoriteSong || undefined,
        };
      });
      const cacheKey = `discovery_cache_v1:${userData.id || 'anon'}`;
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          users: shaped,
          cachedAt: Date.now(),
          discoveryType: 'local',
          selectedCountry: null,
        }),
      );
    } catch {
      // Silent: this is purely an optimization. DiscoveryScreen will still
      // do its own fetch on mount.
    }
  };

  const clearAuthData = async () => {
    // Flip auth state to null immediately so the navigator transitions to the
    // login screen on the very next render — the user never waits on storage
    // cleanup. Storage + socket teardown runs in the background after the UI
    // has already moved on.
    setToken(null);
    setUser(null);
    setPendingProfileSetup(false);

    // Disconnect socket synchronously so no more events arrive after logout.
    try { socketService.disconnect(); } catch {}

    // Clear persisted tokens and user data in the background.
    const currentUserId = user?.id;
    const asyncKeys = [USER_KEY, PENDING_PROFILE_KEY, LANGUAGE_STORAGE_KEY];
    if (currentUserId) {
      asyncKeys.push(`${LANGUAGE_SYNCED_KEY}_${currentUserId}`);
    }
    Promise.all([
      ...asyncKeys.map(key => AsyncStorage.removeItem(key).catch(() => {})),
      tokenManager.clearTokens().catch(() => {}),
    ]).catch((error) => {
      logger.error("Error clearing auth data:", error);
    });
  };

  const login = async (email: string, password: string) => {
    const baseUrl = getApiBaseUrl();
    const loginUrl = `${baseUrl}/api/auth/login`;
    
    try {
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password, ...getDeviceInfo() }),
      });

      const responseText = await response.text();

      if (responseText.startsWith('<')) {
        throw new Error('Server returned HTML instead of JSON. Check backend status.');
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        logger.error('Login non-JSON response:', response.status, responseText.slice(0, 200));
        throw new Error(`Server returned an unexpected response (${response.status}). Please try again.`);
      }
      if (!response.ok) {
        const error: any = new Error(data.message || `Login failed (${response.status})`);
        error.isBanned = data.isBanned || false;
        error.status = response.status;
        error.requiresVerification = data.requiresVerification || false;
        error.userId = data.userId;
        error.appealToken = data.appealToken;
        error.email = data.email;
        error.banReason = data.banReason;
        error.bannedAt = data.bannedAt;
        error.appeal = data.appeal;
        throw error;
      }

      await saveAuthData(data.token, data.user, data.refreshToken);
      // fetchUser() is no longer called here — saveAuthData now fetches the
      // full profile in the background after setting state, eliminating the
      // third sequential network call that caused the login lag.
    } catch (error: any) {
      logger.error('Login error:', error.message);
      throw error;
    }
  };

  const signup = async (email: string, password: string) => {
    const baseUrl = getApiBaseUrl();
    const signupUrl = `${baseUrl}/api/auth/signup`;
    try {
      const response = await fetch(signupUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const responseText = await response.text();
      
      if (responseText.startsWith('<')) {
        throw new Error('Server returned HTML error page. Backend may be down or misconfigured.');
      }
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Server returned invalid response: ${responseText.substring(0, 200)}`);
      }

      if (!response.ok) {
        throw new Error(data.message || `Signup failed with status ${response.status}`);
      }

      return data;
    } catch (error: any) {
      throw new Error(error.message || 'Network request failed');
    }
  };

  const verifyOTP = async (userId: string, otp: string) => {
    const response = await post<{ token: string; user: any }>('/auth/verify-otp', {
      userId,
      otp,
      ...getDeviceInfo(),
    });

    if (response.success && response.data) {
      await Promise.all([
        tokenManager.setAccessToken(response.data.token),
        response.data.refreshToken ? tokenManager.setRefreshToken(response.data.refreshToken) : Promise.resolve(),
        AsyncStorage.setItem(USER_KEY, JSON.stringify(response.data.user)),
        AsyncStorage.setItem(PENDING_PROFILE_KEY, 'true'),
      ]);
      setToken(response.data.token);
      setUser(response.data.user);
      setPendingProfileSetup(true);
      return { needsProfileSetup: true };
    } else {
      throw new Error(response.error || 'Verification failed');
    }
  };

  const completeProfileSetup = async (data: Partial<User>) => {
    if (!token) throw new Error('Not authenticated');

    const response = await put<{ user: User }>('/users/me', data, token);

    if (response.success && response.data) {
      const updatedUser = response.data.user;
      await Promise.all([
        AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser)),
        AsyncStorage.removeItem(PENDING_PROFILE_KEY),
      ]);
      setUser(updatedUser);
      setPendingProfileSetup(false);
    } else {
      throw new Error(response.error || 'Profile setup failed');
    }
  };

  const resendOTP = async (userId: string) => {
    const response = await post<{ message: string }>('/auth/resend-otp', { userId });
    if (!response.success) throw new Error(response.error || response.message || 'Failed to resend OTP');
  };

  const logout = async () => {
    // Capture the token BEFORE we clear local state so the backend revoke
    // call still has something to send.
    const currentToken = token || await tokenManager.getAccessToken();

    // Clear local auth state IMMEDIATELY. This flips `isAuthenticated` to
    // false, which makes the navigator redirect to the login screen on the
    // very next render — the user never waits on the network. The server-side
    // logout fires in the background and is best-effort; even if it fails,
    // the local tokens are already wiped, the socket is disconnected, and
    // the access token will expire on its own within 30 minutes.
    await clearAuthData();

    if (currentToken) {
      fetch(`${getApiBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
      }).catch(() => {});
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    if (!token) return;

    const response = await put<{ user: User }>('/users/me', data, token);

    if (response.success && response.data) {
      const updatedUser = response.data.user;
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    } else {
      throw new Error(response.error || 'Update failed');
    }
  };

  const fetchUser = async () => {
    if (!token) return;

    const response = await get<{ user: User }>('/users/me', {}, token);

    if (response.success && response.data) {
      const updatedUser = response.data.user as any;
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);

      try {
        if (updatedUser.notificationPreferences) {
          await AsyncStorage.setItem(
            'notificationPreferences',
            JSON.stringify(updatedUser.notificationPreferences)
          );
        }
        const pushEnabled = updatedUser.settings?.pushNotifications;
        if (pushEnabled !== undefined) {
          await AsyncStorage.setItem(
            'pushNotificationsEnabled',
            pushEnabled ? 'true' : 'false'
          );
        }
      } catch {}
    }
  };

  const isProfileComplete = userProfileComplete;
  const isAuthenticated = !!token && !!user && isProfileComplete && !pendingProfileSetup;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isProfileComplete,
        isLoading,
        login,
        signup,
        verifyOTP,
        resendOTP,
        completeProfileSetup,
        logout,
        updateProfile,
        fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
