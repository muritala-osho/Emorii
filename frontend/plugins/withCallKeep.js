/**
 * Expo Config Plugin: react-native-callkeep
 *
 * Injects the required AndroidManifest.xml entries for ConnectionService
 * (Android) and ensures the VoIP background mode is present in the iOS
 * Info.plist (Expo already handles backgroundModes in app.json, but this
 * plugin adds the <uses-feature> tag needed for phone accounts on Android).
 *
 * Also sets showWhenLocked + turnScreenOn on MainActivity so that Notifee's
 * fullScreenAction can raise the incoming call UI over the lock screen.
 * Without these attributes the full-screen intent fires but the activity
 * cannot draw over the keyguard — the call UI never appears on a sleeping
 * or locked screen even though the notification itself is URGENT priority.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

function withCallKeepAndroid(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    // ── Lock-screen / screen-wake flags on MainActivity ──────────────────────
    // These are required for Notifee's fullScreenAction to display the incoming
    // call overlay when the device is locked or the screen is off.
    // Without them, Android raises the URGENT notification but the activity
    // cannot show over the keyguard (Android 8.1+ / API 27+).
    if (app.activity) {
      const mainActivity = app.activity.find(
        (a) =>
          a.$?.['android:name'] === '.MainActivity' ||
          a.$?.['android:name'] === 'com.emorii.app.MainActivity',
      );
      if (mainActivity) {
        mainActivity.$['android:showWhenLocked'] = 'true';
        mainActivity.$['android:turnScreenOn'] = 'true';
      }
    }

    if (!app.service) {
      app.service = [];
    }

    const serviceExists = app.service.some(
      (s) =>
        s.$?.['android:name'] ===
        'io.wazo.callkeep.RNCallKeepConnectionService',
    );

    if (!serviceExists) {
      app.service.push({
        $: {
          'android:name': 'io.wazo.callkeep.RNCallKeepConnectionService',
          'android:label': 'Emorii',
          'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {
                $: { 'android:name': 'android.telecom.ConnectionService' },
              },
            ],
          },
        ],
      });
    }

    if (!manifest.manifest['uses-feature']) {
      manifest.manifest['uses-feature'] = [];
    }

    const featureExists = manifest.manifest['uses-feature'].some(
      (f) => f.$?.['android:name'] === 'android.hardware.telephony',
    );

    if (!featureExists) {
      manifest.manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.telephony',
          'android:required': 'false',
        },
      });
    }

    return config;
  });
}

module.exports = withCallKeepAndroid;
