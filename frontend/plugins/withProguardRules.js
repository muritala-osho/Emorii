/**
 * Expo Config Plugin: withProguardRules
 *
 * Appends keep rules for Firebase Messaging, Notifee, and CallKeep to
 * android/app/proguard-rules.pro at build time.
 *
 * WHY THIS IS CRITICAL
 * ─────────────────────
 * app.json has:
 *   "enableProguardInReleaseBuilds": true
 *   "enableShrinkResourcesInReleaseBuilds": true
 *   "enableMinifyInReleaseBuilds": true
 *
 * Without explicit keep rules, R8 (Android's Proguard replacement) silently
 * strips or renames:
 *   • io.invertase.firebase.messaging.RNFirebaseMessagingService — the FCM
 *     service that receives data messages when the app is killed. Without it,
 *     FCM messages are delivered by Google Play Services but the app is never
 *     woken up — the background handler never fires.
 *   • io.invertase.firebase.messaging.ReactNativeFirebaseMessagingHeadlessTask —
 *     the bridge that calls setBackgroundMessageHandler(). Stripping this means
 *     the JS handler registered in index.js never runs.
 *   • app.notifee.core.* — the Notifee foreground service + notification engine.
 *     Without it, displayIncomingCallNotification() throws and the full-screen
 *     call UI never appears.
 *   • io.wazo.callkeep.* — the CallKeep ConnectionService. Stripping prevents
 *     the native phone call UI from registering.
 *
 * These failures are all SILENT — no crash, no log, no error in the backend.
 * Firebase confirms the message was delivered (returns a message ID), but the
 * device never wakes the app because the receiving service class no longer exists.
 *
 * RESULT OF THIS PLUGIN
 * ──────────────────────
 * The keep rules are appended once (idempotent marker prevents duplication) to
 * android/app/proguard-rules.pro at expo prebuild / EAS Build time, so R8
 * preserves all classes required for killed-app FCM delivery and Notifee
 * foreground services.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

const MARKER = '# ── Emorii: Firebase / Notifee / CallKeep keep rules (auto-generated) ──';

const RULES = `
${MARKER}

# ── Firebase Core & GMS ───────────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── React Native Firebase Messaging ──────────────────────────────────────────
# RNFirebaseMessagingService — receives FCM data messages for killed apps.
# ReactNativeFirebaseMessagingHeadlessTask — calls setBackgroundMessageHandler.
# Stripping EITHER of these means FCM messages arrive at Google Play Services
# but the background handler in index.js NEVER fires (silent failure).
-keep class io.invertase.firebase.** { *; }
-keep class io.invertase.firebase.messaging.RNFirebaseMessagingService { *; }
-keep class io.invertase.firebase.messaging.ReactNativeFirebaseMessagingHeadlessTask { *; }
-keep class io.invertase.firebase.messaging.ReactNativeFirebaseMessagingReceiver { *; }
-keep class io.invertase.firebase.messaging.ReactNativeFirebaseMessagingStoreHelper { *; }
-keep class io.invertase.firebase.app.ReactNativeFirebaseApp { *; }
-keep class io.invertase.firebase.common.** { *; }
-dontwarn io.invertase.firebase.**

# ── Notifee ───────────────────────────────────────────────────────────────────
# ForegroundService — Android foreground service that keeps the headless JS
# process alive while the full-screen call notification is displayed.
# Stripping this causes asForegroundService: true to throw
# ForegroundServiceStartNotAllowedException silently on Android 12+.
-keep class app.notifee.** { *; }
-keep class app.notifee.core.** { *; }
-keep class app.notifee.core.ForegroundService { *; }
-keep class app.notifee.core.NotifeeApiModule { *; }
-keep class app.notifee.core.KeepForSdk { *; }
-keep class app.notifee.core.model.** { *; }
-keep class app.notifee.core.event.** { *; }
-dontwarn app.notifee.**

# ── React Native CallKeep ─────────────────────────────────────────────────────
-keep class io.wazo.callkeep.** { *; }
-keep class io.wazo.callkeep.RNCallKeepConnectionService { *; }
-dontwarn io.wazo.callkeep.**

# ── AsyncStorage ─────────────────────────────────────────────────────────────
# Used across JS contexts (FCM handler, Notifee handler, main app) to pass
# call data. Stripping the native module breaks cross-context communication.
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-dontwarn com.reactnativecommunity.asyncstorage.**

# ── Hermes engine ─────────────────────────────────────────────────────────────
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.hermes.**
-dontwarn com.facebook.jni.**

# ── React Native core ─────────────────────────────────────────────────────────
-keep class com.facebook.react.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-dontwarn com.facebook.react.**

# ── Expo modules ─────────────────────────────────────────────────────────────
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# ── END Emorii keep rules ─────────────────────────────────────────────────────
`;

function withProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro',
      );

      if (!fs.existsSync(proguardPath)) {
        console.warn('[withProguardRules] proguard-rules.pro not found at', proguardPath, '— skipping.');
        return config;
      }

      const existing = fs.readFileSync(proguardPath, 'utf8');

      if (existing.includes(MARKER)) {
        console.log('[withProguardRules] Keep rules already present — skipping (idempotent).');
        return config;
      }

      fs.appendFileSync(proguardPath, RULES, 'utf8');
      console.log('[withProguardRules] ✅ Firebase + Notifee + CallKeep keep rules appended to proguard-rules.pro');
      return config;
    },
  ]);
}

module.exports = withProguardRules;
