/**
 * Expo Config Plugin: withNotifeeManifest
 *
 * Ensures the Notifee ForegroundService is declared in AndroidManifest.xml
 * with the correct android:foregroundServiceType attribute required by
 * Android 14 (API 34+).
 *
 * WHY THIS IS NEEDED
 * ───────────────────
 * Android 14 introduced a hard enforcement of foreground service types.
 * When Notifee calls startForeground() with asForegroundService: true, Android
 * checks that:
 *
 *   1. The <service> entry in AndroidManifest.xml has android:foregroundServiceType
 *      declaring the type(s) the service will use.
 *
 *   2. The corresponding USE_FOREGROUND_SERVICE_* permission is declared in the
 *      manifest (e.g. FOREGROUND_SERVICE_PHONE_CALL for type="phoneCall").
 *
 * If either check fails, Android 14 throws ForegroundServiceStartNotAllowedException
 * SILENTLY — no crash in the JS layer, no visible error. The foreground service
 * simply doesn't start, Android kills the headless JS process under memory
 * pressure before the full-screen call UI fires, and the incoming call is missed.
 *
 * Notifee v7.x injects its service via its own Gradle plugin, but the injected
 * entry may omit foregroundServiceType on older Expo prebuild configurations or
 * when the Notifee Gradle plugin doesn't run before the Expo manifest merger.
 * This plugin upserts the entry explicitly so the correct attributes are always
 * present regardless of plugin execution order.
 *
 * SERVICE TYPES USED
 * ──────────────────
 * We declare: phoneCall|dataSync|mediaPlayback|remoteMessaging
 *   • phoneCall        — incoming call foreground service (Answer/Decline overlay)
 *   • dataSync         — AsyncStorage writes during headless JS context
 *   • mediaPlayback    — ringtone playback while call notification is ringing
 *   • remoteMessaging  — FCM message processing foreground service (Android 14)
 *
 * Each type requires the matching FOREGROUND_SERVICE_* permission in the
 * manifest.  Those permissions are declared in app.json → android.permissions:
 *   FOREGROUND_SERVICE_PHONE_CALL   — for phoneCall type
 *   FOREGROUND_SERVICE_DATA_SYNC    — for dataSync type
 *   FOREGROUND_SERVICE_MEDIA_PLAYBACK — for mediaPlayback type
 *   FOREGROUND_SERVICE_REMOTE_MESSAGING — for remoteMessaging type (Android 14)
 * All four are present in app.json. Missing FOREGROUND_SERVICE_REMOTE_MESSAGING
 * was the primary cause of silent killed-state failures on Android 14+ devices.
 *
 * IDEMPOTENCE
 * ────────────
 * If the service entry already exists (injected by Notifee's own Gradle plugin),
 * this plugin merges / overwrites only the foregroundServiceType and exported
 * attributes — it does not create a duplicate entry.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const NOTIFEE_SERVICE = 'app.notifee.core.ForegroundService';

// All foreground service types Notifee may use.
// Declaring all of them means a single build works for call, chat, and media
// use-cases without having to bump this list each time a new feature is added.
const FOREGROUND_SERVICE_TYPES =
  'phoneCall|dataSync|mediaPlayback|remoteMessaging';

function withNotifeeManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app      = manifest.manifest.application[0];

    if (!app.service) {
      app.service = [];
    }

    // ── Upsert the Notifee ForegroundService entry ────────────────────────────
    const existingIdx = app.service.findIndex(
      (s) => s.$?.['android:name'] === NOTIFEE_SERVICE,
    );

    if (existingIdx !== -1) {
      // Entry already present (e.g. injected by Notifee's Gradle plugin).
      // Merge the required attributes — do NOT remove any existing ones.
      const existing = app.service[existingIdx];
      existing.$['android:foregroundServiceType'] = FOREGROUND_SERVICE_TYPES;
      // exported: false — this is an internal service, never exported to other apps.
      existing.$['android:exported'] = 'false';
      console.log('[withNotifeeManifest] ✅ Updated existing Notifee ForegroundService entry with foregroundServiceType:', FOREGROUND_SERVICE_TYPES);
    } else {
      // Entry missing entirely — add it.
      app.service.push({
        $: {
          'android:name':                 NOTIFEE_SERVICE,
          'android:exported':             'false',
          'android:foregroundServiceType': FOREGROUND_SERVICE_TYPES,
        },
      });
      console.log('[withNotifeeManifest] ✅ Injected Notifee ForegroundService into AndroidManifest with foregroundServiceType:', FOREGROUND_SERVICE_TYPES);
    }

    return config;
  });
}

module.exports = withNotifeeManifest;
