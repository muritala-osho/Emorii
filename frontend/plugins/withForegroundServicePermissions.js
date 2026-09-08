/**
 * Keep the Android foreground-service manifest limited to the app's actual use.
 *
 * Some Expo/Android dependencies contribute foreground-service permissions or
 * service types through their own manifests. This final manifest pass removes
 * categories Emorii does not use while preserving phone-call VoIP support.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const UNUSED_PERMISSIONS = new Set([
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
  'android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING',
]);

const UNUSED_SERVICE_TYPES = new Set([
  'dataSync',
  'mediaPlayback',
  'mediaProjection',
  'remoteMessaging',
]);

function withForegroundServicePermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (permission) =>
          !UNUSED_PERMISSIONS.has(permission.$?.['android:name']),
      );
    }

    const application = manifest.application?.[0];
    if (!application?.service) {
      return config;
    }

    application.service = application.service.filter((service) => {
      const serviceTypes = service.$?.['android:foregroundServiceType'];
      if (!serviceTypes) {
        return true;
      }

      const remainingTypes = serviceTypes
        .split('|')
        .filter((type) => !UNUSED_SERVICE_TYPES.has(type));

      if (remainingTypes.length > 0) {
        service.$['android:foregroundServiceType'] = remainingTypes.join('|');
        return true;
      }

      // This is an unused foreground-only service, such as a background
      // media playback service when Emorii is not playing media in the
      // background. Removing the entry prevents Play from detecting it.
      return false;
    });

    return config;
  });
}

module.exports = withForegroundServicePermissions;