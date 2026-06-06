/**
 * Expo Config Plugin: withFirebaseMessagingService
 *
 * Explicitly declares io.invertase.firebase.messaging.RNFirebaseMessagingService
 * in AndroidManifest.xml with all required attributes.
 *
 * WHY THIS IS NEEDED
 * ──────────────────
 * The @react-native-firebase/messaging Gradle plugin normally injects this
 * service automatically. However on some EAS Build configurations or when
 * the Expo manifest merger runs before the Firebase Gradle plugin, the entry
 * can be missing or have incorrect attributes. A missing service means:
 *
 *   - FCM delivers the high-priority data message to Google Play Services
 *   - GMS looks for the app's FirebaseMessagingService to wake and hand off
 *   - The service class is not in the manifest → GMS skips the app
 *   - setBackgroundMessageHandler NEVER fires
 *   - Both call and chat FCM data messages are silently swallowed
 *   - The app only shows Expo fallback pushes (notification messages, not data)
 *
 * This plugin upserts the entry so it is ALWAYS present regardless of plugin
 * execution order, making the killed-state background handler reliable.
 *
 * ANDROID 12+ EXPORTED RULE
 * ──────────────────────────
 * From Android 12 (API 31), any component with an <intent-filter> must have
 * android:exported explicitly set. Firebase's own Gradle plugin sets it to
 * 'false' (internal service, only GMS can trigger it). We match that here.
 *
 * IDEMPOTENCE
 * ───────────
 * If the entry already exists (injected by Firebase's Gradle plugin), this
 * plugin updates only the attributes it owns without adding a duplicate.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const FIREBASE_MESSAGING_SERVICE = 'io.invertase.firebase.messaging.RNFirebaseMessagingService';

function withFirebaseMessagingService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app      = manifest.manifest.application[0];

    if (!app.service) {
      app.service = [];
    }

    const existingIdx = app.service.findIndex(
      (s) => s.$?.['android:name'] === FIREBASE_MESSAGING_SERVICE,
    );

    if (existingIdx !== -1) {
      const existing = app.service[existingIdx];
      existing.$['android:exported'] = 'false';
      console.log(
        '[withFirebaseMessagingService] ✅ RNFirebaseMessagingService entry already present — updated android:exported=false',
      );
    } else {
      app.service.push({
        $: {
          'android:name':     FIREBASE_MESSAGING_SERVICE,
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } },
            ],
          },
        ],
      });
      console.log(
        '[withFirebaseMessagingService] ✅ Injected RNFirebaseMessagingService into AndroidManifest',
      );
    }

    return config;
  });
}

module.exports = withFirebaseMessagingService;
