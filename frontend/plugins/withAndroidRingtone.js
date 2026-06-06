/**
 * Expo Config Plugin: withAndroidRingtone
 *
 * Copies the Emorii incoming-call ringtone into the Android project's
 * res/raw/ directory so Notifee can reference it by name in the
 * notification channel configuration.
 *
 * Why this is needed:
 *   Android notification channels only play sounds from res/raw/. You cannot
 *   reference a file from the JS bundle or assets folder. This plugin runs
 *   at build time (during `expo prebuild` which EAS Build invokes internally)
 *   and copies the MP3 into the correct native location.
 *
 * The file is registered in the Notifee channel as:
 *   sound: 'emorii_ringtone'   (filename without extension, dashes → underscores)
 *
 * This sound plays immediately when the incoming call notification is posted —
 * before the app opens via fullScreenAction. On OEM devices (Samsung, Xiaomi,
 * OPPO, OnePlus) where fullScreenAction is delayed or throttled, the user
 * still hears the ringtone from the notification itself, not just from the
 * in-app UI. The in-app IncomingCallHandler then takes over with a looping
 * audio track once the app has fully started.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

const SOUND_SRC  = 'assets/sounds/phone-calling-1b.mp3';
const SOUND_DEST = 'emorii_ringtone.mp3';

function withAndroidRingtone(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot   = config.modRequest.projectRoot;
      const platformRoot  = config.modRequest.platformProjectRoot;

      const rawDir = path.join(platformRoot, 'app', 'src', 'main', 'res', 'raw');
      fs.mkdirSync(rawDir, { recursive: true });

      const src = path.join(projectRoot, SOUND_SRC);
      const dst = path.join(rawDir, SOUND_DEST);

      if (!fs.existsSync(src)) {
        console.warn(
          `[withAndroidRingtone] Source file not found: ${src}. ` +
          `Incoming call notifications will fall back to the default sound.`,
        );
        return config;
      }

      fs.copyFileSync(src, dst);
      console.log(`[withAndroidRingtone] Copied ringtone → ${dst}`);
      return config;
    },
  ]);
}

module.exports = withAndroidRingtone;
