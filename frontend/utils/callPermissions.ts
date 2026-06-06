import { Alert, Linking, Platform } from 'react-native';
import { Camera } from 'expo-camera';
import { Audio } from './expoAvCompat';
import logger from '@/utils/logger';

/**
 * Unified permission helper for voice and video calls.
 *
 * Two failure modes need to be handled differently on mobile:
 *
 *   1. UNDETERMINED  — the user has never been asked. Calling request*Async
 *      will show the native OS prompt. We just await the result.
 *   2. DENIED        — the user has previously tapped "Don't Allow". The OS
 *      will NEVER show the prompt again. The only way to recover is to send
 *      the user to the app's system Settings page. That's what we do here:
 *      a clear dialog explains why the permission is needed and offers a
 *      one-tap shortcut into Settings via Linking.openSettings().
 *
 * Without this helper, a user who once denied camera access would simply see
 * a black screen on every future video call with no explanation.
 */

type Kind = 'mic' | 'camera' | 'mic+camera';

const COPY: Record<Kind, { title: string; body: string }> = {
  mic: {
    title: 'Microphone Required',
    body:
      'Emorii needs microphone access so the other person can hear you.\n\n' +
      'Tap "Open Settings" and turn on Microphone for Emorii.',
  },
  camera: {
    title: 'Camera Required',
    body:
      'Emorii needs camera access so the other person can see you.\n\n' +
      'Tap "Open Settings" and turn on Camera for Emorii.',
  },
  'mic+camera': {
    title: 'Camera & Microphone Required',
    body:
      'Emorii needs camera and microphone access for video calls.\n\n' +
      'Tap "Open Settings" and turn both on for Emorii.',
  },
};

function showSettingsDialog(kind: Kind) {
  const { title, body } = COPY[kind];
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Open Settings',
      style: 'default',
      onPress: () => {
        Linking.openSettings().catch((err) => {
          logger.error('[CallPerm] Failed to open settings:', err);
        });
      },
    },
  ]);
}

/**
 * Request microphone permission. Returns true if granted, false otherwise.
 * On a previously-denied state, surfaces a dialog with a Settings shortcut.
 */
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const current = await Audio.getPermissionsAsync().catch(() => null);
    if (current?.status === 'granted') return true;

    // canAskAgain === false means the OS will not show the prompt — must go
    // through Settings. Treat first-time (undetermined) as askable.
    if (current && current.status === 'denied' && current.canAskAgain === false) {
      showSettingsDialog('mic');
      return false;
    }

    const result = await Audio.requestPermissionsAsync();
    if (result.status === 'granted') return true;
    showSettingsDialog('mic');
    return false;
  } catch (e) {
    logger.error('[CallPerm] mic check failed:', e);
    return false;
  }
}

/**
 * Request camera permission. Returns true if granted, false otherwise.
 * On a previously-denied state, surfaces a dialog with a Settings shortcut.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const current = await Camera.getCameraPermissionsAsync().catch(() => null);
    if (current?.status === 'granted') return true;

    if (current && current.status === 'denied' && current.canAskAgain === false) {
      showSettingsDialog('camera');
      return false;
    }

    const result = await Camera.requestCameraPermissionsAsync();
    if (result.status === 'granted') return true;
    showSettingsDialog('camera');
    return false;
  } catch (e) {
    logger.error('[CallPerm] camera check failed:', e);
    return false;
  }
}

/**
 * Request both mic and camera in parallel. If either ends up denied, surface
 * a single combined dialog instead of two stacked ones — that way the user
 * sees one clear "open settings" shortcut, not two confusing alerts.
 */
export async function ensureCallPermissions(needsCamera: boolean): Promise<boolean> {
  if (Platform.OS === 'web') return true;

  if (!needsCamera) return ensureMicPermission();

  try {
    // Check current state first. If both already granted, fast-path with no
    // prompts at all — important for return-to-call and accept-incoming flows
    // so the user isn't asked again every single call.
    const [curMic, curCam] = await Promise.all([
      Audio.getPermissionsAsync().catch(() => null),
      Camera.getCameraPermissionsAsync().catch(() => null),
    ]);

    const micGranted = curMic?.status === 'granted';
    const camGranted = curCam?.status === 'granted';
    if (micGranted && camGranted) return true;

    // If either is hard-denied (canAskAgain=false), the OS won't prompt —
    // bail straight to the Settings dialog so the user isn't stuck.
    const micBlocked =
      curMic?.status === 'denied' && curMic.canAskAgain === false;
    const camBlocked =
      curCam?.status === 'denied' && curCam.canAskAgain === false;

    if (micBlocked || camBlocked) {
      const kind: Kind =
        micBlocked && camBlocked ? 'mic+camera' : micBlocked ? 'mic' : 'camera';
      showSettingsDialog(kind);
      return false;
    }

    // Otherwise, request whichever ones aren't yet granted.
    const [micRes, camRes] = await Promise.all([
      micGranted
        ? Promise.resolve({ status: 'granted' as const })
        : Audio.requestPermissionsAsync(),
      camGranted
        ? Promise.resolve({ status: 'granted' as const })
        : Camera.requestCameraPermissionsAsync(),
    ]);

    const micOk = micRes.status === 'granted';
    const camOk = camRes.status === 'granted';
    if (micOk && camOk) return true;

    const kind: Kind = !micOk && !camOk ? 'mic+camera' : !micOk ? 'mic' : 'camera';
    showSettingsDialog(kind);
    return false;
  } catch (e) {
    logger.error('[CallPerm] combined check failed:', e);
    return false;
  }
}
