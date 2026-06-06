/**
 * Expo Config Plugin: withIncomingCallUI
 *
 * Applies the two native Android changes required for the full-screen
 * incoming call overlay to render correctly over the lock screen:
 *
 *  1. styles.xml — adds Theme.AppCompat.Translucent so the call activity
 *     can be launched with a transparent background.  This prevents a black
 *     flash between the lock screen and the in-app call UI.
 *
 *  2. AndroidManifest.xml — adds android:showOnLockScreen="true" to
 *     MainActivity.  This is the pre-API-27 equivalent of showWhenLocked
 *     (already set by withCallKeep) and ensures the flag is present across
 *     all supported Android versions.  android:turnScreenOn is also set here
 *     as a belt-and-suspenders guard in case withCallKeep runs after this
 *     plugin and the attribute is absent.
 *
 * Neither change conflicts with withCallKeep — both plugins read/write
 * different attributes and the Expo manifest mod is idempotent (each
 * attribute write is a simple key=value assignment).
 */

const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

// ─── 1. Theme.AppCompat.Translucent in styles.xml ────────────────────────────

const STYLE_BLOCK = `
    <style name="Theme.AppCompat.Translucent" parent="Theme.AppCompat">
        <item name="android:windowIsTranslucent">true</item>
        <item name="android:windowBackground">@android:color/transparent</item>
        <item name="android:windowNoTitle">true</item>
    </style>`;

function withTranslucentTheme(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const stylesPath = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'res', 'values', 'styles.xml',
      );

      if (!fs.existsSync(stylesPath)) {
        console.warn('[withIncomingCallUI] styles.xml not found — skipping translucent theme.');
        return config;
      }

      let contents = fs.readFileSync(stylesPath, 'utf8');

      if (contents.includes('Theme.AppCompat.Translucent')) {
        return config;
      }

      contents = contents.replace('</resources>', `${STYLE_BLOCK}\n</resources>`);
      fs.writeFileSync(stylesPath, contents, 'utf8');
      console.log('[withIncomingCallUI] ✅ Theme.AppCompat.Translucent added to styles.xml');

      return config;
    },
  ]);
}

// ─── 2. showOnLockScreen + turnScreenOn on MainActivity ──────────────────────

function withMainActivityLockScreenFlags(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!app.activity) return config;

    const mainActivity = app.activity.find(
      (a) =>
        a.$?.['android:name'] === '.MainActivity' ||
        a.$?.['android:name'] === 'com.emorii.app.MainActivity',
    );

    if (!mainActivity) {
      console.warn('[withIncomingCallUI] MainActivity not found in manifest — skipping lock-screen flags.');
      return config;
    }

    // showOnLockScreen is the pre-API-27 flag; showWhenLocked (set by
    // withCallKeep) covers API 27+.  Setting both ensures all Android versions
    // allow the call activity to draw over the keyguard.
    mainActivity.$['android:showOnLockScreen'] = 'true';

    // turnScreenOn may already be present from withCallKeep — idempotent.
    mainActivity.$['android:turnScreenOn'] = 'true';

    console.log('[withIncomingCallUI] ✅ showOnLockScreen + turnScreenOn set on MainActivity');
    return config;
  });
}

// ─── Compose ─────────────────────────────────────────────────────────────────

function withIncomingCallUI(config) {
  config = withTranslucentTheme(config);
  config = withMainActivityLockScreenFlags(config);
  return config;
}

module.exports = withIncomingCallUI;
