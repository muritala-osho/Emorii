/**
 * NotificationPermissionPrompt
 *
 * Shows a rationale screen on Android 13+ (API 33+) BEFORE the system
 * permission dialog appears, so users understand WHY notifications are needed
 * and are less likely to tap "Don't Allow".
 *
 * Android 13 made POST_NOTIFICATIONS a runtime permission — just like Camera
 * or Location. Without it granted, zero notifications appear: no incoming call
 * overlays, no message alerts, no missed call badges. Nothing.
 *
 * Flow:
 *  1. On first login, Android 13+ only, wait 1.5 s then show this screen.
 *  2. User taps "Allow Notifications" → system permission dialog appears.
 *     - Granted → all done, mark as shown, never show again.
 *     - Denied  → show a follow-up nudge with a "Go to Settings" link.
 *  3. "Not now" → dismiss without requesting; we'll re-show on next launch
 *     until they respond (up to 3 times), then give up gracefully.
 *
 * This is shown BEFORE the BatteryOptimizationPrompt (which fires at 3 s) so
 * the user handles permission first.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/hooks/useTheme';
import logger from '@/utils/logger';
import { getApiBaseUrl } from '@/constants/config';
import { tokenManager } from '@/utils/tokenManager';
import { registerForPushNotificationsAsync } from '@/services/notifications';

const SHOWN_KEY = 'notif_permission_prompt_shown_v1';
const DISMISSED_COUNT_KEY = 'notif_permission_prompt_dismissals';
const MAX_DISMISSALS = 3;
const SHOW_DELAY_MS = 1500;

interface Props {
  userId: string | undefined;
}

type Screen = 'rationale' | 'denied';

export default function NotificationPermissionPrompt({ userId }: Props) {
  const [visible, setVisible] = useState(false);
  const [screen, setScreen] = useState<Screen>('rationale');
  const { isDark } = useTheme();

  useEffect(() => {
    if (!userId) return;
    // Android 13+ (API 33) only — earlier versions auto-grant
    if (Platform.OS !== 'android' || (Platform.Version as number) < 33) return;

    let timer: ReturnType<typeof setTimeout>;

    (async () => {
      try {
        // Already permanently resolved — skip
        const done = await AsyncStorage.getItem(SHOWN_KEY);
        if (done) return;

        // Gave up after too many dismissals
        const dismissals = parseInt(
          (await AsyncStorage.getItem(DISMISSED_COUNT_KEY)) || '0',
          10,
        );
        if (dismissals >= MAX_DISMISSALS) return;

        // Permission already granted — no need to ask
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'granted') {
          await AsyncStorage.setItem(SHOWN_KEY, '1');
          return;
        }

        timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
      } catch {
        // non-fatal
      }
    })();

    return () => clearTimeout(timer);
  }, [userId]);

  const requestPermission = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      logger.log('[NotifPermission] Android 13+ POST_NOTIFICATIONS result:', status);

      if (status === 'granted') {
        // Granted — all done, never show again
        await AsyncStorage.setItem(SHOWN_KEY, '1');
        setVisible(false);

        // Now that permission is granted, run the full push token registration.
        // This is critical because setupNotifications() in App.tsx ran at login
        // time — before the user had granted POST_NOTIFICATIONS permission — so
        // both the Expo push token AND the FCM token were skipped.
        // We must retry the full registration here immediately after the grant.
        //
        // Auth token is in SecureStore (tokenManager), NOT AsyncStorage.
        // AsyncStorage.getItem('auth_token') always returns null — wrong key.
        try {
          const authToken = await tokenManager.getAccessToken();
          if (authToken) {
            logger.log('[NotifPermission] Registering push tokens after permission grant…');
            await registerForPushNotificationsAsync(authToken);
            logger.log('[NotifPermission] Push token registration complete after permission grant.');
          } else {
            logger.warn('[NotifPermission] No auth token in SecureStore — skipping push token registration.');
          }
        } catch (regErr) {
          logger.warn('[NotifPermission] Push token registration after permission grant failed (non-fatal):', regErr);
        }
      } else {
        // Denied — show the follow-up nudge
        setScreen('denied');
      }
    } catch (err) {
      logger.warn('[NotifPermission] requestPermissionsAsync failed:', err);
      setVisible(false);
    }
  };

  const openSettings = async () => {
    await AsyncStorage.setItem(SHOWN_KEY, '1');
    setVisible(false);
    Linking.openSettings();
  };

  const dismiss = async () => {
    setVisible(false);
    try {
      const current = parseInt(
        (await AsyncStorage.getItem(DISMISSED_COUNT_KEY)) || '0',
        10,
      );
      await AsyncStorage.setItem(DISMISSED_COUNT_KEY, String(current + 1));
    } catch {}
  };

  if (!visible) return null;

  const bg = isDark ? '#1A0A2E' : '#ffffff';
  const text = isDark ? '#ffffff' : '#1A0A2E';
  const subtext = isDark ? '#c0a8e0' : '#555577';
  const divider = isDark ? '#2e1a4e' : '#e0d8f0';
  const tagBg = isDark ? '#2e1a4e' : '#f0ebff';

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: bg }]}>

          <View style={styles.iconRow}>
            <Text style={styles.icon}>🔔</Text>
          </View>

          {screen === 'rationale' ? (
            <>
              <Text style={[styles.title, { color: text }]}>
                Stay connected, always
              </Text>

              <Text style={[styles.body, { color: subtext }]}>
                Emorii needs notification permission so you never miss an
                incoming call or message — even when the app is closed.
              </Text>

              {/* Feature tags */}
              <View style={styles.tagRow}>
                {['📞 Incoming calls', '💬 New messages', '❤️ New matches'].map((tag) => (
                  <View key={tag} style={[styles.tag, { backgroundColor: tagBg }]}>
                    <Text style={[styles.tagText, { color: text }]}>{tag}</Text>
                  </View>
                ))}
              </View>

              <Text style={[styles.footnote, { color: subtext }]}>
                You can change this any time in your phone's Settings.
              </Text>

              <View style={[styles.divider, { backgroundColor: divider }]} />

              <Pressable
                style={styles.primaryBtn}
                onPress={requestPermission}
                android_ripple={{ color: '#3d1f7a' }}
              >
                <Text style={styles.primaryBtnText}>Allow Notifications</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryBtn}
                onPress={dismiss}
                android_ripple={{ color: '#ddd' }}
              >
                <Text style={[styles.secondaryBtnText, { color: subtext }]}>
                  Not now
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: text }]}>
                Notifications are blocked
              </Text>

              <Text style={[styles.body, { color: subtext }]}>
                Without notifications, incoming calls and messages won't appear
                when Emorii is closed.
              </Text>

              <Text style={[styles.body, { color: subtext, marginTop: 10 }]}>
                To fix this, open Settings and enable notifications for
                Emorii.
              </Text>

              <View style={[styles.stepsBox, { borderColor: divider }]}>
                <Text style={[styles.step, { color: subtext }]}>
                  1. Tap{' '}
                  <Text style={{ fontWeight: '600', color: text }}>
                    "Open Settings"
                  </Text>{' '}
                  below
                </Text>
                <Text style={[styles.step, { color: subtext }]}>
                  2. Tap{' '}
                  <Text style={{ fontWeight: '600', color: text }}>
                    Notifications
                  </Text>
                </Text>
                <Text style={[styles.step, { color: subtext }]}>
                  3. Turn on{' '}
                  <Text style={{ fontWeight: '600', color: text }}>
                    Allow Notifications
                  </Text>
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: divider }]} />

              <Pressable
                style={styles.primaryBtn}
                onPress={openSettings}
                android_ripple={{ color: '#3d1f7a' }}
              >
                <Text style={styles.primaryBtnText}>Open Settings</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryBtn}
                onPress={dismiss}
                android_ripple={{ color: '#ddd' }}
              >
                <Text style={[styles.secondaryBtnText, { color: subtext }]}>
                  Skip for now
                </Text>
              </Pressable>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 12,
  },
  tag: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '500',
  },
  footnote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.8,
  },
  stepsBox: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  step: {
    fontSize: 13,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  primaryBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
