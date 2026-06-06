import logger from '@/utils/logger';
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity, AppState, Platform } from "react-native";
import * as Sentry from '@sentry/react-native';
import { NavigationContainer } from "@react-navigation/native";
import { navigationRef } from "@/utils/navigationRef";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { Ionicons } from "@expo/vector-icons";
import { initCallKeep } from "@/services/callkeep";
import { registerVoipPushNotifications } from "@/services/voipPush";
import { pushLiveLocation } from "@/utils/liveLocation";
import { tokenManager } from "@/utils/tokenManager";
import socketService from "@/services/socket";
import { navigateToCallScreen } from "@/utils/navigateToCallScreen";

import RootNavigator from "@/navigation/RootNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";
import { UnreadProvider } from "@/contexts/UnreadContext";
import { CallProvider } from "@/contexts/CallContext";
import { MaintenanceProvider } from "@/contexts/MaintenanceContext";
import MaintenanceOverlay from "@/components/MaintenanceOverlay";
import IncomingCallHandler from "@/components/calls/IncomingCallHandler";
import FloatingCallBar from "@/components/calls/FloatingCallBar";
import UpdateBanner from "@/components/UpdateBanner";
import FullScreenIntentPrompt from "@/components/FullScreenIntentPrompt";
import NotificationPermissionPrompt from "@/components/NotificationPermissionPrompt";
import {
  registerForPushNotificationsAsync,
  setupNotificationListeners,
  runNotificationDiagnostics,
} from "@/services/notifications";
import { getApiBaseUrl } from "@/constants/config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { iapService } from "@/services/iapService";

SplashScreen.preventAutoHideAsync();

// Initialize CallKit (iOS) / ConnectionService (Android) as early as possible
// so the native call infrastructure is ready before the first call arrives.
if (Platform.OS !== 'web') {
  initCallKeep('Emorii');
}

function navigateFromNotification(data: Record<string, any>) {
  const nav = navigationRef as any;
  const { type, screen, senderId, senderName, senderPhoto } = data || {};
  const photo = senderPhoto || "";

  // cancel_call has no navigation target — skip.
  if (type === 'cancel_call') {
    logger.log('[App] navigateFromNotification: cancel_call — no navigation needed');
    return;
  }

  // ── Call notifications ────────────────────────────────────────────────────
  //
  // Call navigations do NOT use the early `!navigationRef.isReady()` guard
  // because they delegate to navigateToCallScreen(), which owns its own retry
  // loop (every 300 ms, up to 30 s) and verifies the current route after each
  // navigate() call.  This is necessary because React Navigation navigate() is
  // a silent no-op in production builds when the target route is not yet
  // registered (e.g. the authenticated Stack.Navigator hasn't fully mounted).
  //
  // Three paths:
  //   A) Backgrounded — IncomingCallHandler is mounted; accept programmatically.
  //   B) Killed-state WITH Agora params — navigate directly to call screen.
  //   C) Killed-state WITHOUT Agora params — queue via AsyncStorage for ICH.
  if (
    type === 'call' ||
    type === 'voice_call' ||
    type === 'video_call' ||
    type === 'INCOMING_CALL' ||
    type === 'incoming_call'
  ) {
    let callData: Record<string, any> = data?.callData ?? {};
    if (typeof callData === 'string') {
      try { callData = JSON.parse(callData); } catch { callData = {}; }
    }
    const callerId    = data?.callerId   || data?.senderId   || '';
    const callerName  = data?.callerName || data?.senderName || 'Unknown';
    const callerPhoto = data?.callerPhoto || data?.senderPhoto || '';
    const isVideo     = type === 'video_call' || data?.callType === 'video' || callData?.callType === 'video';
    const callType    = isVideo ? 'video' : 'voice';

    logger.log(
      '[App] navigateFromNotification: CALL tap',
      '| type:', type,
      '| callerId:', callerId,
      '| callType:', callType,
      '| hasChannelName:', !!callData?.channelName,
      '| hasAppId:', !!callData?.appId,
      '| navigatorReady:', navigationRef.isReady(),
    );

    // Path A: app was backgrounded — IncomingCallHandler is mounted.
    // __answerCallFromNotification returns true if it found live call data and
    // navigated, or false if incomingCallRef was null (socket disconnected while
    // app was backgrounded). On false we fall through to Path B / Path C so
    // the push-payload callData (which includes Agora params) is used instead.
    const answerFn = (global as any).__answerCallFromNotification;
    if (typeof answerFn === 'function') {
      logger.log('[App] navigateFromNotification: Path A — calling __answerCallFromNotification');
      const answered = answerFn();
      if (answered !== false) {
        logger.log('[App] navigateFromNotification: Path A — answered successfully');
        return;
      }
      logger.log('[App] navigateFromNotification: Path A — call data not ready, falling through to Path B/C');
    }

    // Path B: killed-state with full Agora params in the push payload.
    // navigateToCallScreen retries every 300 ms and verifies the route was
    // reached — it does NOT silently drop the navigation on first failure.
    if (callData?.channelName && callData?.appId) {
      const targetScreen = isVideo ? 'VideoCall' : 'VoiceCall';
      logger.log('[App] navigateFromNotification: Path B — launching navigateToCallScreen →', targetScreen);
      AsyncStorage.removeItem('@emorii_pending_call').catch(() => {});
      navigateToCallScreen(targetScreen, {
        callerId,
        userId:       callerId,
        userName:     callerName,
        userPhoto:    callerPhoto,
        isIncoming:   true,
        callData,
        callAccepted: true,
        callType,
      });
      return;
    }

    // Path C: killed-state without Agora params (push payload truncated or
    // backend omitted callData).  Queue the pending call for IncomingCallHandler
    // to consume, then trigger it directly if ICH is already mounted.
    //
    // WHY: Effect B (this code path) fires only after auth loads. By that time,
    // IncomingCallHandler is already mounted and its early cold-start
    // useEffect has already run — finding nothing in AsyncStorage because
    // Path C hadn't written yet. We must notify ICH directly via
    // __injectPendingCall so it can consume the call and navigate to the
    // call screen.  Navigating to Discovery here was wrong and is removed.
    logger.log('[App] navigateFromNotification: Path C — no Agora params; injecting into ICH');
    const pending = {
      callerId, callerName, callerPhoto, callType,
      callData,
      answeredFromNotification: true,
      timestamp: Date.now(),
    };
    (global as any).__pendingVoipCall = pending;
    AsyncStorage.setItem('@emorii_pending_call', JSON.stringify(pending)).catch(() => {});
    const injectFn = (global as any).__injectPendingCall;
    if (typeof injectFn === 'function') {
      logger.log('[App] navigateFromNotification: Path C — calling __injectPendingCall on mounted ICH');
      injectFn(pending);
    } else {
      // ICH not mounted yet — its mount effect will pick up __pendingVoipCall
      // or AsyncStorage when it renders.
      logger.log('[App] navigateFromNotification: Path C — ICH not yet mounted, relying on mount effect');
    }
    return;
  }

  // ── All other notification types require a ready navigator ────────────────
  if (!navigationRef.isReady()) {
    logger.warn('[App] navigateFromNotification: navigator not ready — skipping type:', type);
    return;
  }

  // Message — open the exact conversation.
  // matchId (the Match document _id) is included in the notification payload
  // and passed through to ChatDetailScreen so the correct conversation is
  // opened even when the same two users have more than one match document.
  if (type === "message" || screen === "ChatDetail") {
    const matchId = data?.matchId;
    if (senderId || matchId) {
      logger.log('[App] navigateFromNotification → ChatDetail | senderId:', senderId, '| matchId:', matchId);
      nav.navigate("ChatDetail", {
        matchId: matchId || undefined,
        userId: senderId,
        userName: senderName || "User",
        userPhoto: photo,
      });
    } else {
      logger.log('[App] navigateFromNotification → Chats tab (no senderId/matchId for message)');
      nav.navigate("MainTabs", { screen: "Chats" });
    }
    return;
  }

  // New match — open Matches tab
  if (type === "match" || screen === "Matches") {
    logger.log('[App] navigateFromNotification → Matches tab | type:', type);
    nav.navigate("MainTabs", { screen: "Matches" });
    return;
  }

  // Like or Super Like — open Matches tab (where likes are shown)
  if (type === "like" || type === "super_like") {
    logger.log('[App] navigateFromNotification → Matches tab | type:', type);
    nav.navigate("MainTabs", { screen: "Matches" });
    return;
  }

  // Missed call — open chat so user can call back
  if (type === "missed_call") {
    const callerId = data?.callerId || senderId;
    const callerName = data?.callerName || senderName;
    const matchId = data?.matchId;
    if (callerId || matchId) {
      logger.log('[App] navigateFromNotification → ChatDetail (missed_call) | callerId:', callerId, '| matchId:', matchId);
      nav.navigate("ChatDetail", {
        matchId: matchId || undefined,
        userId: callerId,
        userName: callerName || "User",
        userPhoto: photo,
      });
    } else {
      logger.log('[App] navigateFromNotification → Chats tab (missed_call no callerId)');
      nav.navigate("MainTabs", { screen: "Chats" });
    }
    return;
  }

  // Story view, reply, or reaction — open that user's story
  if (type === "story") {
    if (senderId) {
      logger.log('[App] navigateFromNotification → StoryViewer | senderId:', senderId);
      nav.navigate("StoryViewer", { userId: senderId, userName: senderName || "User", userPhoto: photo });
    } else {
      logger.log('[App] navigateFromNotification → Discovery (story, no senderId)');
      nav.navigate("MainTabs", { screen: "Discovery" });
    }
    return;
  }

  // Profile view — open Visitors screen
  if (type === "profile_view" || screen === "Visitors") {
    logger.log('[App] navigateFromNotification → Visitors | type:', type);
    nav.navigate("Visitors");
    return;
  }

  // Verification status update — open Verification screen
  if (type === "verification" || screen === "Verification") {
    logger.log('[App] navigateFromNotification → Verification | type:', type);
    nav.navigate("Verification");
    return;
  }

  // Subscription / premium update — open Premium screen
  if (type === "subscription" || screen === "Premium") {
    logger.log('[App] navigateFromNotification → Premium | type:', type);
    nav.navigate("Premium");
    return;
  }

  // Security / device alert — open Device Management
  if (type === "security" || screen === "DeviceManagement") {
    logger.log('[App] navigateFromNotification → DeviceManagement | type:', type);
    nav.navigate("DeviceManagement");
    return;
  }

  // Broadcast / system announcements — go to Discovery (home)
  if (type === "broadcast" || type === "system") {
    logger.log('[App] navigateFromNotification → Discovery (broadcast/system)');
    nav.navigate("MainTabs", { screen: "Discovery" });
    return;
  }

  // Generic screen-based fallback
  if (screen === "Discovery") {
    logger.log('[App] navigateFromNotification → Discovery (screen fallback)');
    nav.navigate("MainTabs", { screen: "Discovery" });
    return;
  }

  logger.warn('[App] navigateFromNotification: unhandled notification type:', type, '| screen:', screen);
}

// Print API configuration on startup
try {
  logger.log("\n\n========== EMORII APP STARTED ==========");
  logger.log("API Base URL:", getApiBaseUrl());
  logger.log("Signup URL:", `${getApiBaseUrl()}/api/auth/signup`);
  logger.log("Login URL:", `${getApiBaseUrl()}/api/auth/login`);
  logger.log("==========================================\n\n");
} catch (e) {
  logger.error("[App] EXPO_PUBLIC_API_URL is not set — API calls will fail.", e);
}

function LanguageSync() {
  const { user, isLoading } = useAuth();
  const { syncFromProfile, resetLanguage } = useLanguage();

  useEffect(() => {
    if (!isLoading) {
      if (user?.id && user?.preferences?.language) {
        syncFromProfile(user.preferences.language, user.id);
      } else if (!user) {
        resetLanguage();
      }
    }
  }, [
    isLoading,
    user?.id,
    user?.preferences?.language,
    syncFromProfile,
    resetLanguage,
    user,
  ]);

  return null;
}

function AppContent() {
  const { isDark } = useTheme();
  const { user, token, isLoading } = useAuth();
  const [isOverlayVisible, setIsOverlayVisible] = React.useState(false);
  const appState = useRef(AppState.currentState);
  const lastTokenRegistration = useRef<number>(0);

  // Stores the cold-start notification data read by the early capture effect.
  // Using state (not a ref) is intentional: when getLastNotificationResponseAsync
  // resolves after auth has already loaded, the state update re-triggers Effect B
  // so the notification is processed even if auth loaded first.
  const [coldStartNotif, setColdStartNotif] = useState<Record<string, any> | null>(null);
  const coldStartProcessed = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoading]);

  // ── Effect A: capture the cold-start notification AS EARLY AS POSSIBLE ──
  // getLastNotificationResponseAsync clears its value on first read, so we
  // must read it before anything else does.  We store the payload in
  // coldStartNotifRef and process it in Effect B once auth has loaded.
  // Running this in a [] effect (no auth dependency) ensures it fires on the
  // very first render, well before auth finishes loading from AsyncStorage.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync()
      .then((lastResponse) => {
        if (lastResponse) {
          const data = lastResponse.notification.request.content.data as Record<string, any>;
          logger.log(
            '[App] Cold-start: notification captured early',
            '| type:', data?.type,
            '| callerId:', data?.callerId,
            '| hasCallData:', !!(data?.callData),
          );
          setColdStartNotif(data);
        } else {
          logger.log('[App] Cold-start: no pending notification response (app not launched by tap)');
        }
      })
      .catch((err) => logger.warn('[App] getLastNotificationResponseAsync error:', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect B: process captured notification once BOTH auth AND notification data are ready ──
  // Auth must be loaded (user?.id truthy) before we navigate — the
  // authenticated Stack.Navigator (with VoiceCall / VideoCall routes)
  // only mounts after isLoading becomes false.
  // coldStartNotif in the dependency array ensures this effect re-runs if
  // getLastNotificationResponseAsync resolves after auth has already loaded
  // (race-condition fix for slow devices or slow native cache reads).
  useEffect(() => {
    if (!user?.id || !coldStartNotif || coldStartProcessed.current) return;
    coldStartProcessed.current = true;
    logger.log(
      '[App] Cold-start: auth ready — processing notification',
      '| type:', coldStartNotif.type,
      '| userId:', user.id,
    );
    // navigateFromNotification delegates call types to navigateToCallScreen(),
    // which owns its own retry loop and does NOT need the navigator to be ready
    // at this exact instant.
    navigateFromNotification(coldStartNotif);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, coldStartNotif]);

  // ── Global IAP purchase listener ─────────────────────────────────────────
  // Catches purchases that complete while PremiumScreen is not mounted
  // (e.g. the user backgrounds the app mid-purchase or navigates away).
  // The backend's idempotency key prevents double-crediting when
  // PremiumScreen's own listener also fires for the same purchase.
  useEffect(() => {
    if (!user?.id || !token || Platform.OS === 'web') return;

    let removePurchase: (() => void) | null = null;
    let removeError: (() => void) | null = null;

    const setupGlobalIAPListener = async () => {
      const available = await iapService.loadIAP();
      if (!available) return;

      removePurchase = iapService.addPurchaseListener(async (purchase: any) => {
        const productId = iapService.getPurchaseProductId(purchase);
        const receipt = Platform.OS === 'ios'
          ? purchase.transactionReceipt
          : iapService.getPurchaseToken(purchase);
        if (!receipt || !productId) return;
        try {
          const authToken = token || await (await import('@/utils/tokenManager')).tokenManager.getAccessToken();
          if (!authToken) return;
          const res = await fetch(`${getApiBaseUrl()}/api/subscription/validate-receipt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({
              platform: Platform.OS === 'ios' ? 'ios' : 'android',
              receipt,
              productId,
            }),
          });
          const json = await res.json();
          if (json.success) {
            await iapService.finishTransaction(purchase);
            logger.log('[App] Global IAP listener: purchase validated and finished');
          }
        } catch (err) {
          logger.warn('[App] Global IAP listener: validation failed', err);
        }
      });

      removeError = iapService.addErrorListener((error: any) => {
        if (error?.code !== 'E_USER_CANCELLED') {
          logger.warn('[App] Global IAP listener: purchase error', error?.message);
        }
      });
    };

    setupGlobalIAPListener();

    return () => {
      removePurchase?.();
      removeError?.();
    };
  }, [user?.id, token]);

  // Initialize notifications when user is authenticated
  useEffect(() => {
    if (!user?.id) return;

    let unsubscribe: (() => void) | undefined;

    const setupNotifications = async () => {
      try {
        // Run full diagnostic before any registration so we can see
        // the device's starting state in the logs.
        runNotificationDiagnostics().catch(() => {});

        // Register for push notifications — pass token directly so we
        // don't rely on AsyncStorage timing after a fresh login
        await registerForPushNotificationsAsync(token ?? undefined);

        // Register the user's IANA device timezone so other users see
        // accurate "local time" on their profile even when GPS is missing.
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const authToken = token || (await tokenManager.getAccessToken());
          if (tz && authToken) {
            await fetch(`${getApiBaseUrl()}/api/notifications/register-timezone`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authToken}`,
              },
              body: JSON.stringify({ timezone: tz }),
            });
          }
        } catch (tzErr) {
          logger.warn('[App] Timezone registration failed (non-fatal):', tzErr);
        }

        // Register VoIP push token (iOS only) for native CallKit incoming call
        // screen even when the app is completely killed.
        if (Platform.OS === 'ios') {
          registerVoipPushNotifications(async (voipToken) => {
            try {
              const authToken = token || (await tokenManager.getAccessToken());
              if (!authToken) return;
              await fetch(`${getApiBaseUrl()}/api/notifications/register-voip-token`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({ voipToken }),
              });
              logger.log('[App] VoIP push token registered with backend.');
            } catch (err) {
              logger.warn('[App] Failed to register VoIP token:', err);
            }
          });
        }

        // Setup Expo notification listeners.
        //
        // addNotificationReceivedListener: fires when a notification arrives while
        // the app is in the foreground (AFTER setNotificationHandler decides to show
        // it). Use this for in-app badge updates or any UI that reacts to incoming
        // notifications without the user tapping.
        //
        // addNotificationResponseReceivedListener: fires when the user TAPS a
        // notification from any state (foreground banner, background shade, or —
        // on some Android OEMs — the notification that launched the app from
        // killed state).  For the killed-state tap we also have Effect A/B above;
        // this listener is the fallback for OEMs that deliver it here instead.
        const unsubExpo = setupNotificationListeners(
          (notification) => {
            // Notification arrived in foreground — log it.
            // setNotificationHandler already decided whether to show a banner.
            // No navigation here: the user hasn't tapped anything yet.
            const data = notification?.request?.content?.data as Record<string, any>;
            logger.log('[App] Foreground notification received — type:', data?.type, '| screen:', data?.screen);
          },
          async (response) => {
            const data = response?.notification?.request?.content?.data as Record<string, any>;
            logger.log(
              '[App] Notification tapped (listener)',
              '| type:', data?.type,
              '| callerId:', data?.callerId,
              '| wasAlreadyProcessed:', coldStartProcessed.current && coldStartNotif === data,
            );
            // navigateFromNotification handles call types with navigateToCallScreen
            // (retry + verify), so this is safe even if the navigator isn't ready yet.
            navigateFromNotification(data);
            // Fire-and-forget engagement tracking — never block navigation
            try {
              const authToken = await tokenManager.getAccessToken();
              if (authToken) {
                fetch(`${getApiBaseUrl()}/api/engagement/notification-opened`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${authToken}`,
                  },
                  body: JSON.stringify({ type: data?.type || 'unknown', screen: data?.screen || "unknown" }),
                }).catch(() => {});
              }
            } catch {}
          },
        );

        unsubscribe = () => {
          unsubExpo();
        };
      } catch (error) {
        logger.error("Failed to setup notifications:", error);
      }
    };

    setupNotifications();
    lastTokenRegistration.current = Date.now();

    pushLiveLocation(token ?? undefined, { force: true }).catch(() => {});

    // Daily push-token heartbeat — fires once every 24 hours while the app
    // stays continuously open (e.g. a phone left on a charger all day).
    // The foreground AppState listener below covers the wake-from-background
    // case; this interval covers the rare but real stay-open-all-day case.
    // Both paths call registerForPushNotificationsAsync which is idempotent:
    // if the token hasn't changed it just POSTs the same value and the backend
    // ignores it. If the token was cleared by the receipt poller (stale device),
    // Expo issues a fresh one and the backend is immediately updated.
    const DAILY_MS = 24 * 60 * 60 * 1000;
    const dailyHeartbeat = setInterval(() => {
      lastTokenRegistration.current = Date.now();
      registerForPushNotificationsAsync(token ?? undefined).catch(() => {});
    }, DAILY_MS);

    // Re-register push token when the app comes back to the foreground, but
    // no more than once per hour to avoid TOO_MANY_REGISTRATIONS from Firebase.
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        // App returned to foreground — tell the server to stop sending push
        // notifications (the user can now see messages directly in the UI).
        socketService.setUserForeground();

        // The phone may have been asleep for hours. The proactive-refresh
        // setTimeout is paused while the JS thread is suspended, so the access
        // token can be expired by the time we wake up. Check immediately and
        // refresh BEFORE any other foregrounded code (push registration,
        // live-location push, screen mounts) makes its first API call.
        if (tokenManager.isAccessTokenExpiringSoon(token ?? null)) {
          tokenManager.refresh().catch(() => {});
        } else if (token) {
          // Re-arm the timer that was paused during background.
          tokenManager.armProactiveRefresh(token);
        }

        const timeSinceLastReg = Date.now() - lastTokenRegistration.current;
        if (timeSinceLastReg >= ONE_HOUR_MS) {
          lastTokenRegistration.current = Date.now();
          registerForPushNotificationsAsync(token ?? undefined).catch(() => {});
        }

        pushLiveLocation(token ?? undefined).catch(() => {});
      } else if (nextState.match(/inactive|background/) && appState.current === "active") {
        // App moved to background — tell the server to send push notifications
        // even though the socket is still connected, because the user cannot
        // see messages while the app is not in the foreground.
        socketService.setUserBackground();
      }
      appState.current = nextState;
    });

    return () => {
      if (unsubscribe) unsubscribe();
      appStateSubscription.remove();
      clearInterval(dailyHeartbeat);
    };
  }, [user?.id]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <CallProvider>
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
            <IncomingCallHandler />
            <FloatingCallBar />
          </NavigationContainer>
          <MaintenanceOverlay />
          <UpdateBanner />
          <NotificationPermissionPrompt userId={user?.id} />
          <FullScreenIntentPrompt userId={user?.id} />
          <StatusBar style={isDark ? "light" : "dark"} />
        </CallProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function App() {
  return (
    <ErrorBoundary
      onError={(error, componentStack) => {
        try {
          Sentry.captureException(error, {
            extra: { componentStack },
            tags: { source: 'ErrorBoundary' },
          });
        } catch {}
      }}
    >
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <MaintenanceProvider>
              <AuthProvider>
                <UnreadProvider>
                  <LanguageSync />
                  <AppContent />
                </UnreadProvider>
              </AuthProvider>
            </MaintenanceProvider>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default Sentry.withProfiler(App);
