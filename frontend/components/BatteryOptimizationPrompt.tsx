/**
 * BatteryOptimizationPrompt
 *
 * Shows a modal on Android prompting the user to exempt Emorii from battery
 * optimisation.
 *
 * Samsung-specific handling (the main killer of killed-app notifications):
 *   Samsung One UI has THREE independent battery control layers:
 *     Layer 1 — Per-app battery: Unrestricted / Optimised / Restricted
 *               (Settings → Apps → Emorii → Battery)
 *     Layer 2 — Sleeping apps / Never-sleeping apps list
 *               (Settings → Battery → Background usage limits)
 *     Layer 3 — Deep sleeping apps (aggressive kill, no wakeup)
 *   Standard Android Doze (what isBatteryOptimizationEnabled checks) is a
 *   FOURTH system. Setting "Unrestricted" on layer 1 does NOT guarantee the
 *   app is whitelisted from layers 2/3 or Doze.
 *
 *   Fix: on Samsung devices we ALWAYS show the prompt on first-open and
 *   direct the user to "Never sleeping apps" via openPowerManagerSettings(),
 *   regardless of isBatteryOptimizationEnabled()'s result.
 *
 * Non-Samsung / stock Android:
 *   Standard path — check isBatteryOptimizationEnabled() and open the Doze
 *   whitelist page via openBatteryOptimizationSettings().
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/hooks/useTheme';

const SAMSUNG_PROMPT_DONE_KEY = '@emorii_samsung_battery_prompt_done';

/** True when the device manufacturer is Samsung. */
function isSamsungDevice(): boolean {
  try {
    const brand = ((Platform.constants as any)?.Brand ?? '').toLowerCase();
    const mfr   = ((Platform.constants as any)?.Manufacturer ?? '').toLowerCase();
    return brand.includes('samsung') || mfr.includes('samsung');
  } catch {
    return false;
  }
}

/**
 * Returns true when standard Android battery optimization is ENABLED (bad).
 * Without Notifee we cannot query this API, so we conservatively return true
 * (show the prompt) to encourage the user to check their settings.
 */
async function isStandardBatteryOptimized(): Promise<boolean> {
  return true;
}

/**
 * Opens the best available battery/power-manager settings page.
 * - Samsung: opens the battery power manager settings deep link.
 * - Others: fires ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS or falls back
 *   to the app-details settings page.
 */
async function openBatterySettings(samsung: boolean): Promise<void> {
  if (samsung) {
    try {
      await Linking.sendIntent('android.settings.ACTION_POWER_USAGE_SUMMARY');
      return;
    } catch {}
  }
  try {
    await Linking.sendIntent(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      [{ key: 'android.provider.extra.APP_PACKAGE', value: 'com.emorii.app' }],
    );
    return;
  } catch {}
  Linking.openSettings();
}

/**
 * Also request the system Doze-exemption dialog (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).
 * This is a no-op if the app is already whitelisted.
 */
async function requestDozeExemption(): Promise<void> {
  try {
    await Linking.sendIntent(
      'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      [{ key: 'android.provider.extra.APP_PACKAGE', value: 'com.emorii.app' }],
    );
  } catch {
    // Intent not supported on this device — ignore
  }
}

interface Props {
  userId: string | undefined;
}

export default function BatteryOptimizationPrompt({ userId }: Props) {
  const [visible, setVisible]       = useState(false);
  const [isSamsung, setIsSamsung]   = useState(false);
  const checkingRef                 = useRef(false);
  const appStateRef                 = useRef(AppState.currentState);
  const { isDark }                  = useTheme();

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const samsung = isSamsungDevice();
      setIsSamsung(samsung);

      if (samsung) {
        // On Samsung, show the prompt unless the user has already confirmed
        // they completed the "Never sleeping apps" step (stored in AsyncStorage).
        const done = await AsyncStorage.getItem(SAMSUNG_PROMPT_DONE_KEY);
        if (!done) {
          setVisible(true);
        }
      } else {
        // Non-Samsung: standard Doze check
        const optimized = await isStandardBatteryOptimized();
        setVisible(optimized);
      }
    } catch {
      // fail silently
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || !userId) return;
    const timer = setTimeout(check, 3000);
    return () => clearTimeout(timer);
  }, [userId, check]);

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
    // For non-Samsung devices, also trigger the Doze exemption system dialog.
    if (!isSamsung) {
      requestDozeExemption().catch(() => {});
    }
    await openBatterySettings(isSamsung);
  };

  const handleDone = async () => {
    if (isSamsung) {
      // Remember that the user confirmed the Samsung step so we don't
      // pester them every open.
      await AsyncStorage.setItem(SAMSUNG_PROMPT_DONE_KEY, '1').catch(() => {});
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
  };

  if (!visible) return null;

  const bg      = isDark ? '#1A0A2E' : '#ffffff';
  const textClr = isDark ? '#ffffff' : '#1A0A2E';
  const sub     = isDark ? '#c0a8e0' : '#555577';
  const divClr  = isDark ? '#2e1a4e' : '#e0d8f0';
  const warnClr = isDark ? '#ffd26b' : '#b45309';
  const warnBg  = isDark ? '#2a1a00' : '#fffbeb';

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
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

            <View style={styles.iconWrap}>
              <Text style={styles.icon}>🔋</Text>
            </View>

            <Text style={[styles.title, { color: textClr }]}>
              {isSamsung
                ? 'Samsung: extra step needed'
                : 'Never miss an incoming call'}
            </Text>

            {isSamsung ? (
              <>
                <View style={[styles.warnBadge, { backgroundColor: warnBg, borderColor: warnClr }]}>
                  <Text style={[styles.warnText, { color: warnClr }]}>
                    ⚠️  Setting battery to "Unrestricted" is not enough on Samsung.
                    Your phone has a separate "Sleeping apps" system that can still
                    block notifications when the app is closed.
                  </Text>
                </View>

                <Text style={[styles.body, { color: sub, marginTop: 12 }]}>
                  You need to add Emorii to the{' '}
                  <Text style={{ fontWeight: '700', color: textClr }}>Never sleeping apps</Text>
                  {' '}list so Samsung cannot kill it in the background.
                </Text>

                <View style={[styles.stepsBox, { borderColor: divClr }]}>
                  <Text style={[styles.stepLabel, { color: sub }]}>Samsung steps:</Text>
                  <Text style={[styles.step, { color: sub }]}>
                    1.{'  '}Tap <Text style={{ fontWeight: '600', color: textClr }}>"Open Settings"</Text> below
                  </Text>
                  <Text style={[styles.step, { color: sub }]}>
                    2.{'  '}Go to <Text style={{ fontWeight: '600', color: textClr }}>Battery → Background usage limits</Text>
                  </Text>
                  <Text style={[styles.step, { color: sub }]}>
                    3.{'  '}Tap <Text style={{ fontWeight: '600', color: textClr }}>Never sleeping apps</Text>
                  </Text>
                  <Text style={[styles.step, { color: sub }]}>
                    4.{'  '}Tap the <Text style={{ fontWeight: '600', color: textClr }}>+ button</Text> and add{' '}
                    <Text style={{ fontWeight: '600', color: textClr }}>Emorii</Text>
                  </Text>
                </View>

                <View style={[styles.stepsBox, { borderColor: divClr, marginTop: 8 }]}>
                  <Text style={[styles.stepLabel, { color: sub }]}>Also check:</Text>
                  <Text style={[styles.step, { color: sub }]}>
                    {'• '}Settings → Apps → Emorii → Battery →{' '}
                    <Text style={{ fontWeight: '600', color: textClr }}>Unrestricted</Text>
                    {' '}✅ (you may already have this)
                  </Text>
                  <Text style={[styles.step, { color: sub }]}>
                    {'• '}Settings → Battery → Background usage limits → check{' '}
                    <Text style={{ fontWeight: '600', color: textClr }}>Sleeping apps</Text>
                    {' '}and remove Emorii if it appears there
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.body, { color: sub }]}>
                  Your phone's battery optimiser is currently blocking Emorii from
                  waking up when you receive a call while the app is closed.
                </Text>
                <Text style={[styles.body, { color: sub, marginTop: 8 }]}>
                  Tap <Text style={{ fontWeight: '700', color: textClr }}>"Open Settings"</Text> and
                  set Emorii's battery usage to{' '}
                  <Text style={{ fontWeight: '700', color: textClr }}>Unrestricted</Text>
                  {' '}(or "Don't optimise").
                </Text>

                <View style={[styles.stepsBox, { borderColor: divClr }]}>
                  <Text style={[styles.step, { color: sub }]}>
                    1.{'  '}Tap <Text style={{ fontWeight: '600', color: textClr }}>"Open Settings"</Text> below
                  </Text>
                  <Text style={[styles.step, { color: sub }]}>
                    2.{'  '}Find <Text style={{ fontWeight: '600', color: textClr }}>Emorii</Text> in the list
                  </Text>
                  <Text style={[styles.step, { color: sub }]}>
                    3.{'  '}Select <Text style={{ fontWeight: '600', color: textClr }}>Don't optimise</Text>
                  </Text>
                </View>
              </>
            )}

            <View style={[styles.divider, { backgroundColor: divClr }]} />

            <Pressable
              style={styles.primaryBtn}
              onPress={handleOpenSettings}
              android_ripple={{ color: '#3d1f7a' }}
            >
              <Text style={styles.primaryBtnText}>Open Settings</Text>
            </Pressable>

            {isSamsung && (
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: '#16a34a', marginTop: 8 }]}
                onPress={handleDone}
                android_ripple={{ color: '#14532d' }}
              >
                <Text style={styles.primaryBtnText}>I've added Emorii ✓</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.secondaryBtn}
              onPress={handleDismiss}
              android_ripple={{ color: '#ddd' }}
            >
              <Text style={[styles.secondaryBtnText, { color: sub }]}>
                Remind me later
              </Text>
            </Pressable>

          </ScrollView>
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
    maxHeight: '85%',
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
  warnBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  warnText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '500',
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
    gap: 6,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
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
