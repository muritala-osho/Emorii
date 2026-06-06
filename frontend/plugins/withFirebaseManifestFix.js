/**
 * Expo Config Plugin: Firebase manifest merge fix
 *
 * `expo-notifications` and `@react-native-firebase/messaging` both declare
 * the same Android <meta-data> tags for the default Firebase notification
 * channel ID and notification color, with conflicting values. The Android
 * manifest merger refuses to silently pick one and fails the release build
 * with:
 *
 *   Attribute meta-data#com.google.firebase.messaging.default_notification_channel_id
 *   ... is also present at [:react-native-firebase_messaging] ... value=().
 *   Suggestion: add 'tools:replace="android:value"' to <meta-data> element.
 *
 * This plugin:
 *   1. Ensures the `xmlns:tools` namespace is declared on <manifest>.
 *   2. Adds `tools:replace="android:value"` to the channel-id meta-data tag.
 *   3. Adds `tools:replace="android:resource"` to the notification-color tag.
 *
 * Result: the values configured via the `expo-notifications` plugin in
 * app.json win over the empty defaults from @react-native-firebase/messaging.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const TOOLS_NS = 'http://schemas.android.com/tools';

const TARGETS = [
  {
    name: 'com.google.firebase.messaging.default_notification_channel_id',
    replaceAttr: 'android:value',
  },
  {
    name: 'com.google.firebase.messaging.default_notification_color',
    replaceAttr: 'android:resource',
  },
];

function withFirebaseManifestFix(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    if (!manifest.manifest.$['xmlns:tools']) {
      manifest.manifest.$['xmlns:tools'] = TOOLS_NS;
    }

    const app = manifest.manifest.application[0];
    if (!app['meta-data']) {
      app['meta-data'] = [];
    }

    for (const target of TARGETS) {
      const tag = app['meta-data'].find(
        (m) => m.$?.['android:name'] === target.name,
      );
      if (tag) {
        tag.$['tools:replace'] = target.replaceAttr;
      }
    }

    return config;
  });
}

module.exports = withFirebaseManifestFix;
