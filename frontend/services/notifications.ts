import logger from '@/utils/logger';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tokenManager } from '@/utils/tokenManager';

// IMPORTANT: defineTask must be called synchronously at module top level,
// before registerRootComponent or any component mounts.
const BACKGROUND_NOTIFICATION_TASK = 'EMORII_INCOMING_CALL_TASK';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
  if (error) {
    logger.warn('[NotifBgTask] Task error:', error);
    return;
  }
  try {
    const notification = data?.notification;
    const notifData: Record<string, any> = notification?.request?.content?.data ?? {};
    const type = notifData?.type as string;

    const isCall =
      type === 'voice_call' || type === 'video_call' ||
      type === 'call'       || type === 'incoming_call' || type === 'INCOMING_CALL';

    if (isCall) {
      let callData = notifData.callData ?? {};
      if (typeof callData === 'string') {
        try { callData = JSON.parse(callData); } catch { callData = {}; }
      }

      const pending = {
        callerId:    notifData.callerId   || notifData.senderId   || '',
        callerName:  notifData.callerName || notifData.senderName || 'Unknown',
        callerPhoto: notifData.callerPhoto || notifData.senderPhoto || '',
        callType:    notifData.callType   || (type === 'video_call' ? 'video' : 'voice'),
        callData,
        answeredFromNotification: false,
        timestamp: Date.now(),
      };

      AsyncStorage.setItem('@emorii_pending_call', JSON.stringify(pending)).catch(() => {});
      logger.log('[NotifBgTask] Stored pending call — callerId:', pending.callerId, '| type:', type);

    } else if (type === 'missed_call' || type === 'cancel_call') {
      try {
        const CALL_NOTIF_TYPES = ['voice_call', 'video_call', 'call', 'incoming_call', 'INCOMING_CALL'];
        const presented = await Notifications.getPresentedNotificationsAsync();
        const staleIds = presented
          .filter((n) => CALL_NOTIF_TYPES.includes(n.request?.content?.data?.type as string))
          .map((n) => n.request.identifier);
        await Promise.all(staleIds.map((id) => Notifications.dismissNotificationAsync(id).catch(() => {})));
        if (staleIds.length > 0) {
          logger.log('[NotifBgTask] Dismissed', staleIds.length, 'stale call notification(s) for', type);
        }
      } catch (err: any) {
        logger.warn('[NotifBgTask] Failed to dismiss stale call notifs:', err?.message ?? err);
      }
      AsyncStorage.removeItem('@emorii_pending_call').catch(() => {});
      logger.log('[NotifBgTask] Cleared @emorii_pending_call for', type);

    } else {
      logger.log('[NotifBgTask] Non-call notification (', type, ') — no action needed');
    }
  } catch (err: any) {
    logger.warn('[NotifBgTask] Handler error:', err?.message ?? err);
  }
});

const SHOW_ALL = {
  shouldShowAlert: true,
  shouldPlaySound: true,
  shouldSetBadge: true,
  shouldShowBanner: true,
  shouldShowList: true,
} as const;

const SUPPRESS_ALL = {
  shouldShowAlert: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
} as const;

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const notifId   = notification?.request?.identifier ?? 'unknown';
    const notifData = notification?.request?.content?.data as Record<string, any> | undefined;
    const notifType = notifData?.type as string | undefined;

    logger.log(
      '[NotifHandler] ▶ handleNotification — id:', notifId,
      '| type:', notifType ?? '(none)',
      '| title:', notification?.request?.content?.title ?? '(no title)',
    );

    try {
      if (
        notifType === 'call' ||
        notifType === 'voice_call' ||
        notifType === 'video_call' ||
        notifType === 'INCOMING_CALL' ||
        notifType === 'incoming_call'
      ) {
        logger.log('[NotifHandler] Suppressed foreground call notification — type:', notifType);
        return SUPPRESS_ALL;
      }

      const timeout = new Promise<[null, null]>((resolve) =>
        setTimeout(() => resolve([null, null]), 1500),
      );
      const reads = Promise.all([
        AsyncStorage.getItem('notificationPreferences'),
        AsyncStorage.getItem('pushNotificationsEnabled'),
      ]);
      const [prefsRaw, pushEnabled] = await Promise.race([reads, timeout]);

      if (prefsRaw === null && pushEnabled === null) {
        logger.warn('[NotifHandler] AsyncStorage timeout — falling back to SHOW_ALL id:', notifId);
        return SHOW_ALL;
      }

      if (pushEnabled === 'false') {
        logger.log('[NotifHandler] Suppressed — notifications disabled id:', notifId);
        return SUPPRESS_ALL;
      }

      const prefs: Record<string, any> = prefsRaw ? JSON.parse(prefsRaw) : {};
      const soundEnabled = prefs.soundEnabled !== false;

      logger.log('[NotifHandler] Showing — type:', notifType ?? '(none)', '| sound:', soundEnabled);
      return {
        shouldShowAlert: true,
        shouldPlaySound: soundEnabled,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    } catch (err: any) {
      logger.warn('[NotifHandler] Error — falling back to SHOW_ALL id:', notifId, '| err:', err?.message ?? err);
      return SHOW_ALL;
    }
  },
});

const isExpoGo = Constants.executionEnvironment === 'storeClient';

export async function registerForPushNotificationsAsync(authTokenOverride?: string) {
  logger.log('\n[Notifications] ─── registerForPushNotificationsAsync ───');
  logger.log('[Notifications] Platform:', Platform.OS);
  logger.log('[Notifications] Is physical device:', Device.isDevice);
  logger.log('[Notifications] Is Expo Go:', isExpoGo);

  let token: string | undefined;

  if (Platform.OS === 'android') {
    logger.log('[Notifications] Setting up Android channels…');
    await setupAndroidChannels();
    logger.log('[Notifications] Android channels ready.');
  }

  if (isExpoGo) {
    logger.warn('[Notifications] Running in Expo Go — token is for testing only via expo.dev/notifications');
  }

  if (!Device.isDevice) {
    logger.warn('[Notifications] Must use a physical device for push notifications (not a simulator).');
    return;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  logger.log('[Notifications] Existing permission status:', existingStatus);
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    logger.log('[Notifications] Requesting permission…');
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    logger.log('[Notifications] Permission response:', finalStatus);
  }

  if (finalStatus !== 'granted') {
    logger.error('[Notifications] Permission denied.');
    return;
  }

  logger.log('[Notifications] Permission granted.');

  if (Platform.OS !== 'web') {
    try {
      const isRegistered = await Notifications.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
      if (!isRegistered) {
        await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
        logger.log('[Notifications] Background notification task registered');
      } else {
        logger.log('[Notifications] Background notification task already registered');
      }
    } catch (bgErr: any) {
      logger.warn('[Notifications] Background task registration failed (non-fatal):', bgErr?.message ?? bgErr);
    }
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    logger.log('[Notifications] EAS projectId:', projectId || 'NOT FOUND');

    logger.log('[Notifications] Fetching Expo push token from Expo servers…');
    if (projectId && !isExpoGo) {
      try {
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      } catch (tokenErr: any) {
        const errMsg = tokenErr?.message || String(tokenErr);
        if (
          errMsg.includes('SERVICE_NOT_AVAILABLE') ||
          errMsg.includes('MISSING_INSTANCEID') ||
          errMsg.includes('Google Play services') ||
          errMsg.includes('FirebaseApp') ||
          errMsg.includes('GMS')
        ) {
          logger.error('[Notifications] GMS error — update Google Play Services:', errMsg);
        } else {
          logger.warn('[Notifications] getExpoPushTokenAsync with projectId failed, retrying without it:', errMsg);
        }
        try {
          token = (await Notifications.getExpoPushTokenAsync()).data;
        } catch (retryErr: any) {
          logger.error('[Notifications] Retry failed:', retryErr?.message || retryErr);
          return;
        }
      }
    } else {
      token = (await Notifications.getExpoPushTokenAsync()).data;
    }
    logger.log('[Notifications] Token obtained:', token);

    if (!token) {
      logger.error('[Notifications] Token came back empty — check Expo server or projectId config.');
      return;
    }

    const storedToken = await AsyncStorage.getItem('pushToken');
    logger.log('[Notifications] Previously stored token:', storedToken ? storedToken.slice(0, 40) + '…' : 'none');

    await AsyncStorage.setItem('pushToken', token);

    const tokenChanged = token !== storedToken;
    logger.log('[Notifications] Registering token with backend (changed:', tokenChanged, ')…');

    const authToken = authTokenOverride || await tokenManager.getAccessToken();

    if (!authToken) {
      logger.warn('[Notifications] No auth token — user may not be logged in yet. Skipping registration.');
      return token;
    }

    const { getApiBaseUrl } = require('../constants/config');
    const apiUrl = getApiBaseUrl();
    const registerUrl = `${apiUrl}/api/notifications/register-token`;
    logger.log('[Notifications] Registering token at:', registerUrl);

    let registered = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      logger.log(`[Notifications] Registration attempt ${attempt}/3…`);
      try {
        const res = await fetch(registerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ pushToken: token }),
        });

        const responseText = await res.text();
        logger.log(`[Notifications] Attempt ${attempt} — status: ${res.status}, body: ${responseText}`);

        if (res.ok) {
          logger.log('[Notifications] Push token registered successfully.');
          registered = true;
          break;
        } else {
          logger.warn(`[Notifications] Registration attempt ${attempt} failed — HTTP ${res.status}: ${responseText}`);
        }
      } catch (fetchErr: any) {
        logger.error(`[Notifications] Registration attempt ${attempt} network error:`, fetchErr?.message || fetchErr);
      }
      if (attempt < 3) {
        const delay = 2000 * attempt;
        logger.log(`[Notifications] Retrying in ${delay}ms…`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    if (!registered) {
      logger.error('[Notifications] Failed to register push token after 3 attempts. Clearing stored token.');
      await AsyncStorage.removeItem('pushToken');
    }
  } catch (error: any) {
    logger.error('[Notifications] Unexpected error during token setup:', error?.message || error);
  }

  logger.log('[Notifications] ─────────────────────────────────────────────\n');
  return token;
}

export async function setupAndroidChannels() {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B9D',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B9D',
    sound: 'default',
  });

  // messages_v2: MAX importance forces heads-up banners on OEM devices
  // (Samsung, Xiaomi, OPPO) that suppress HIGH-importance channels.
  // bypassDnd: true ensures messages break through Do Not Disturb.
  // lockscreenVisibility PUBLIC shows the sender name on the lock screen.
  await Notifications.setNotificationChannelAsync('messages_v2', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B9D',
    sound: 'default',
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync('matches', {
    name: 'Matches & Likes',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#FF6B9D',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('likes', {
    name: 'Likes',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250],
    lightColor: '#FF6B9D',
  });

  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Incoming Calls',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
    lightColor: '#10B981',
    sound: 'default',
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });

  await Notifications.setNotificationChannelAsync('support', {
    name: 'Support',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B9D',
  });

  await Notifications.setNotificationChannelAsync('engagement', {
    name: 'Activity & Updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF6B9D',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('security', {
    name: 'Security Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#FF4444',
    sound: 'default',
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

if (Platform.OS === 'android') {
  setupAndroidChannels().catch((err) => {
    logger.warn('[Notifications] Early channel bootstrap failed (non-fatal):', err);
  });
}

export async function runNotificationDiagnostics(): Promise<void> {
  logger.log('\n[NotifDiag] ─── NOTIFICATION DIAGNOSTICS ───');

  try {
    logger.log('[NotifDiag] Platform:', Platform.OS, '| Version:', Platform.Version);
    logger.log('[NotifDiag] Physical device:', Device.isDevice ? 'yes' : 'NO — push not supported on simulators');
    logger.log('[NotifDiag] Expo Go:', isExpoGo ? 'YES — push tokens are test-only' : 'standalone build');
  } catch (e: any) {
    logger.warn('[NotifDiag] Platform check failed:', e?.message);
  }

  try {
    const perms = await Notifications.getPermissionsAsync();
    const status = perms.status;
    if (status === 'granted') {
      logger.log('[NotifDiag] Permission: granted');
    } else {
      logger.warn('[NotifDiag] Permission:', status, '— notifications will not appear until granted');
    }
    if (perms.ios) {
      logger.log(
        '[NotifDiag] iOS alert:', perms.ios.alertSetting,
        '| sound:', perms.ios.soundSetting,
        '| badge:', perms.ios.badgeSetting,
      );
    }
  } catch (e: any) {
    logger.warn('[NotifDiag] Permission check failed:', e?.message);
  }

  if (Platform.OS === 'android') {
    try {
      const channels = await Notifications.getNotificationChannelsAsync();
      const ids = channels?.map((c) => `${c.id}(imp=${c.importance})`).join(', ') ?? 'NONE';
      logger.log('[NotifDiag] Android channels registered:', ids || 'NONE');

      const critical: Record<string, string> = {
        messages_v2: 'chat messages',
        calls:       'voice/video calls',
        default:     'general notifications',
      };
      for (const [id, desc] of Object.entries(critical)) {
        const exists = channels?.some((c) => c.id === id);
        if (exists) {
          logger.log(`[NotifDiag] Channel '${id}' (${desc}): present`);
        } else {
          logger.warn(`[NotifDiag] Channel '${id}' (${desc}): MISSING`);
        }
      }
    } catch (e: any) {
      logger.warn('[NotifDiag] Channel check failed:', e?.message);
    }
  }

  // 4. AsyncStorage notification preferences
  try {
    const pushEnabled = await AsyncStorage.getItem('pushNotificationsEnabled');
    const prefsRaw    = await AsyncStorage.getItem('notificationPreferences');
    const storedToken = await AsyncStorage.getItem('pushToken');

    if (pushEnabled === 'false') {
      logger.warn('[NotifDiag] pushNotificationsEnabled = "false" — setNotificationHandler is SUPPRESSING all foreground banners');
    } else {
      logger.log('[NotifDiag] pushNotificationsEnabled:', pushEnabled ?? '(null = defaults to enabled)');
    }

    if (prefsRaw) {
      try {
        const prefs = JSON.parse(prefsRaw);
        logger.log('[NotifDiag] notificationPreferences:', JSON.stringify(prefs));
      } catch {
        logger.warn('[NotifDiag] notificationPreferences could not be parsed:', prefsRaw);
      }
    } else {
      logger.log('[NotifDiag] notificationPreferences: (null = all defaults enabled)');
    }

    if (storedToken) {
      logger.log('[NotifDiag] Stored Expo push token:', storedToken.slice(0, 30) + '…');
    } else {
      logger.warn('[NotifDiag] Stored Expo push token: NONE — backend cannot deliver notifications until registered');
    }
  } catch (e: any) {
    logger.warn('[NotifDiag] AsyncStorage checks failed:', e?.message);
  }

  if (Platform.OS !== 'web') {
    try {
      const isRegistered = await Notifications.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
      if (isRegistered) {
        logger.log('[NotifDiag] Background task (EMORII_INCOMING_CALL_TASK): registered');
      } else {
        logger.warn('[NotifDiag] Background task (EMORII_INCOMING_CALL_TASK): NOT registered');
      }
    } catch (e: any) {
      logger.warn('[NotifDiag] Background task check failed:', e?.message);
    }
  }

  logger.log('[NotifDiag] ─────────────────────────────────────────────────\n');
}


export async function sendLocalNotification(title: string, body: string, data?: any) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null,
  });
}

export function setupNotificationListeners(
  onNotificationReceived: (notification: any) => void,
  onNotificationResponse: (response: any) => void
) {
  logger.log('[Notifications] Setting up notification listeners…');
  const cleanups: (() => void)[] = [];

  try {
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      logger.log('[Notifications] Notification received in foreground:', JSON.stringify(notification?.request?.content));
      onNotificationReceived(notification);
    });
    cleanups.push(() => receivedSubscription.remove());

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      logger.log('[Notifications] User tapped notification:', JSON.stringify(response?.notification?.request?.content?.data));
      onNotificationResponse(response);
    });
    cleanups.push(() => responseSubscription.remove());

    logger.log('[Notifications] Listeners active.');
    return () => cleanups.forEach(fn => fn());
  } catch (error) {
    logger.error('[Notifications] Failed to set up listeners:', error);
    return () => {};
  }
}
