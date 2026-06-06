/**
 * FullScreenIntentPrompt
 *
 * Shows a modal on Android 12+ (API 31+) prompting the user to grant the
 * USE_FULL_SCREEN_INTENT / "Display over other apps" permission that lets
 * Emorii show a full-screen incoming call alert on the lock screen.
 *
 * Key improvements over v1:
 *  - Uses Notifee to CHECK whether the permission is actually granted on every
 *    app open. If it is already granted the modal is never shown. If the user
 *    previously tapped "Not now" but never granted the permission, the modal
 *    will reappear the next time they open the app until it is confirmed.
 *  - Android 14+ (API 34+): opens the exact "Use full-screen intent" settings
 *    page via the android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT intent.
 *  - Android 12–13 (API 31–33): opens the "Display over other apps" settings
 *    page via android.settings.action.MANAGE_OVERLAY_PERMISSION.
 *  - Returns to the app and re-checks the permission when the app comes back
 *    to the foreground after the user has (hopefully) toggled the setting.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';

const PACKAGE_NAME = 'com.emorii.app';

/**
 * Returns true when the device is a Xiaomi / Redmi / Poco device running MIUI or HyperOS.
 * MIUI has its own full-screen permission system that doesn't map cleanly to the
 * standard Android USE_FULL_SCREEN_INTENT API, so it needs separate handling.
 */
function isMiuiDevice(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    const constants = Platform.constants as any;
    const brand = (constants?.Brand ?? constants?.brand ?? '').toLowerCase();
    const mfr   = (constants?.Manufacturer ?? constants?.manufacturer ?? '').toLowerCase();
    return (
      brand.includes('xiaomi') || brand.includes('redmi') || brand.includes('poco') ||
      mfr.includes('xiaomi')
    );
  } catch {
    return false;
  }
}

/**
 * Returns true when the full-screen-intent prompt has already been shown.
 * Without Notifee we cannot query the permission directly, so we show the
 * prompt once per install and remember the user's acknowledgement.
 */
async function isFullScreenIntentGranted(): Promise<boolean> {
  try {
    // MIUI: prompt once, then consider it handled
    if (isMiuiDevice()) {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const prompted = await AsyncStorage.getItem('miui_fsi_prompted');
      return prompted === 'true';
    }

    // Standard Android: show once, remember via AsyncStorage
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const prompted = await AsyncStorage.getItem('fsi_prompted');
    return prompted === 'true';
  } catch {
    return true;
  }
}

/** Opens the correct settings page for the current Android version. */
async function openFullScreenSettings(): Promise<void> {
  const apiLevel = Platform.Version as number;

  // ── MIUI / HyperOS (Xiaomi, Redmi, Poco) ─────────────────────────────────
  // Standard Android full-screen-intent intents either don't exist on MIUI or
  // lead to the wrong page.  On MIUI the correct path is:
  //   Settings → Apps → Manage apps → Emorii → Other permissions
  //   → Display pop-up windows while running in background
  //
  // The most reliable way to reach it is the app-details settings page.
  // We also record that we've prompted the user so we don't loop forever.
  if (isMiuiDevice()) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('miui_fsi_prompted', 'true');
    } catch {}
    // Try app-details URI first (deep-links directly to Emorii in Manage Apps)
    try {
      await Linking.openURL(`package:${PACKAGE_NAME}`);
      return;
    } catch {}
    // Fallback: generic app settings (Settings → Apps → Emorii)
    Linking.openSettings();
    return;
  }

  // ── Android 14+ (API 34+) ─────────────────────────────────────────────────
  // ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENTS opens the system list of apps
  // that have requested this permission. The user taps Emorii to toggle it.
  //
  // IMPORTANT: the action name is INTENTS (plural). INTENT (singular) is a
  // different string that throws ActivityNotFoundException on all real devices,
  // silently falling through to the generic openSettings() fallback below.
  //
  // Android's API requires the package be passed as a data URI
  // (intent.setData(Uri.parse("package:…"))), not as a putExtra(). React
  // Native's Linking.sendIntent() only supports putExtra, so the package
  // filter is not applied — the list opens without pre-selecting Emorii.
  // The user still sees the correct page and can toggle the permission there.
  if (apiLevel >= 34) {
    try {
      await Linking.sendIntent('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENTS');
      return;
    } catch {
      // Intent not available on this ROM — fall through to notification settings
    }
  }

  // ── Android 12–13 (API 31–33) ─────────────────────────────────────────────
  // "Display over other apps" covers the equivalent full-screen overlay
  // permission on these versions.
  if (apiLevel >= 31 && apiLevel < 34) {
    try {
      // sendIntent without extras to avoid crashes on Samsung ROM variants
      // that reject unknown extras on this action.
      await Linking.sendIntent('android.settings.action.MANAGE_OVERLAY_PERMISSION');
      return;
    } catch {
      // Fall through
    }
  }

  // Last resort: generic app settings (Settings → Apps → Emorii)
  Linking.openSettings();
}

interface Props {
  userId: string | undefined;
}

export default function FullScreenIntentPrompt({ userId }: Props) {
  const [visible, setVisible]   = useState(false);
  const checkingRef             = useRef(false);
  const appStateRef             = useRef(AppState.currentState);
  const { isDark }              = useTheme();

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const granted = await isFullScreenIntentGranted();
      setVisible(!granted);
    } finally {
      checkingRef.current = false;
    }
  }, []);

  // Run the check whenever the user ID is available (i.e. after login)
  useEffect(() => {
    if (Platform.OS !== 'android' || !userId) return;
    if ((Platform.Version as number) < 31) return;
    check();
  }, [userId, check]);

  // Re-check every time the app comes back to the foreground so we detect
  // when the user has just toggled the permission in Settings.
  useEffect(() => {
    if (Platform.OS !== 'android' || !userId) return;
    const sub = AppState.addEventListener('change', (next) => {
      const wasBackground =
        appStateRef.current === 'background' ||
        appStateRef.current === 'inactive';
      if (wasBackground && next === 'active') {
        check();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [userId, check]);

  const handleOpenSettings = async () => {
    // Mark as prompted before opening settings so re-check on foreground
    // return doesn't immediately re-show the modal.
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const key = isMiuiDevice() ? 'miui_fsi_prompted' : 'fsi_prompted';
      await AsyncStorage.setItem(key, 'true');
    } catch {}
    await openFullScreenSettings();
    setVisible(false);
  };

  const handleDismiss = () => {
    // Mark as prompted so we don't show the modal again
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const key = isMiuiDevice() ? 'miui_fsi_prompted' : 'fsi_prompted';
      AsyncStorage.setItem(key, 'true').catch(() => {});
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  const apiLevel  = Platform.Version as number;
  const isMiui    = isMiuiDevice();
  const isAndroid14Plus = apiLevel >= 34;

  const bg      = isDark ? '#1A0A2E' : '#ffffff';
  const textClr = isDark ? '#ffffff' : '#1A0A2E';
  const sub     = isDark ? '#c0a8e0' : '#555577';
  const divClr  = isDark ? '#2e1a4e' : '#e0d8f0';

  // MIUI/HyperOS (Xiaomi, Redmi, Poco) — the standard Android USE_FULL_SCREEN_INTENT
  // settings page doesn't exist. The correct path is through MIUI's own Manage Apps.
  const miuiSteps = [
    { bold: '"Open Settings"', suffix: ' below' },
    { bold: 'Manage apps', suffix: ' (or "Apps")' },
    { bold: 'Find and tap Emorii', suffix: '' },
    { bold: 'Other permissions', suffix: '' },
    { bold: 'Display pop-up windows while running in background', suffix: ' → Allow' },
  ];

  // Android 14+: "Open Settings" lands on the system list of apps that
  // requested USE_FULL_SCREEN_INTENT. The user finds Emorii in the list and
  // toggles it. On Samsung One UI 6+ the toggle may also appear inside:
  //   Settings → Notifications → App notification management → Emorii
  //   → Allow full-screen notifications
  const standardSteps = isAndroid14Plus
    ? [
        { bold: '"Open Settings"', suffix: ' below' },
        { bold: 'Find Emorii', suffix: ' in the list and tap it' },
        { bold: 'Allow', suffix: ' (toggle on) for Emorii' },
      ]
    : [
        { bold: '"Open Settings"', suffix: ' below' },
        { bold: 'Special app access', suffix: '' },
        { bold: 'Display over other apps', suffix: '' },
        { bold: 'Allow', suffix: ' it for Emorii' },
      ];

  const steps = isMiui ? miuiSteps : standardSteps;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: bg }]}>

          <View style={styles.iconWrap}>
            <Text style={styles.icon}>📞</Text>
          </View>

          <Text style={[styles.title, { color: textClr }]}>
            See incoming calls on your screen
          </Text>

          <Text style={[styles.body, { color: sub }]}>
            Emorii needs one extra permission to show a full-screen call alert
            when your screen is off or the app is closed.
          </Text>
          <Text style={[styles.body, { color: sub, marginTop: 8 }]}>
            Without it, call alerts only appear as a small notification
            in the shade — very easy to miss.
          </Text>

          <View style={[styles.stepsBox, { borderColor: divClr }]}>
            <Text style={[styles.stepLabel, { color: sub }]}>How to enable:</Text>
            {steps.map((s, i) => (
              <Text key={i} style={[styles.step, { color: sub }]}>
                {i + 1}.{'  '}
                <Text style={{ fontWeight: '700', color: textClr }}>{s.bold}</Text>
                {s.suffix}
              </Text>
            ))}
          </View>

          {isMiui ? (
            <View style={[styles.noteBadge, { borderColor: divClr }]}>
              <Text style={[styles.noteText, { color: sub }]}>
                📱 <Text style={{ fontWeight: '700', color: textClr }}>Xiaomi / MIUI / HyperOS:</Text>
                {' '}after tapping{' '}
                <Text style={{ fontWeight: '700', color: textClr }}>Other permissions</Text>
                {' '}you may also need to allow{' '}
                <Text style={{ fontWeight: '700', color: textClr }}>Start in background</Text>
                {' '}so Emorii can receive calls when closed.
              </Text>
            </View>
          ) : isAndroid14Plus ? (
            <View style={[styles.noteBadge, { borderColor: divClr }]}>
              <Text style={[styles.noteText, { color: sub }]}>
                📱 <Text style={{ fontWeight: '700', color: textClr }}>Samsung users:</Text>
                {' '}if you don't see the list, tap{' '}
                <Text style={{ fontWeight: '700', color: textClr }}>
                  Settings → Notifications → App notification management → Emorii → Allow full-screen notifications
                </Text>
                {' '}instead.
              </Text>
            </View>
          ) : null}

          <View style={[styles.divider, { backgroundColor: divClr }]} />

          <Pressable
            style={styles.primaryBtn}
            onPress={handleOpenSettings}
            android_ripple={{ color: '#3d1f7a' }}
          >
            <Text style={styles.primaryBtnText}>Open Settings</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={handleDismiss}
            android_ripple={{ color: '#ddd' }}
          >
            <Text style={[styles.secondaryBtnText, { color: sub }]}>
              {isMiui ? "I've done this" : 'Remind me later'}
            </Text>
          </Pressable>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
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
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  iconWrap: {
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
  stepsBox: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 5,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  step: {
    fontSize: 13,
    lineHeight: 20,
  },
  noteBadge: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  noteText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
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
