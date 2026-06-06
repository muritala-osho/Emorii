import logger from '@/utils/logger';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';

let RNCallKeep: any = null;
let _loadAttempted = false;

const isExpoGo = Constants.appOwnership === 'expo';

function loadCallKeep() {
  if (RNCallKeep) return RNCallKeep;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  if (Platform.OS === 'web' || isExpoGo) {
    logger.warn('[CallKeep] Skipped — platform:', Platform.OS, '| isExpoGo:', isExpoGo);
    return null;
  }
  try {
    const mod = require('react-native-callkeep').default;
    const nativeBridge = (NativeModules as any).RNCallKeep;
    if (!mod || !nativeBridge) {
      logger.warn('[CallKeep] Native bridge unavailable — skipping.');
      return null;
    }
    RNCallKeep = mod;
    logger.log('[CallKeep] Native module loaded');
    return RNCallKeep;
  } catch (err) {
    logger.warn('[CallKeep] Module require() failed:', err);
    return null;
  }
}

let _initialized = false;

const uuidMap = new Map<string, string>();

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function initCallKeep(appName: string = 'Emorii') {
  if (_initialized || Platform.OS === 'web') return;
  const CK = loadCallKeep();
  if (!CK) {
    logger.warn('[CallKeep] initCallKeep: skipping — native module not loaded');
    return;
  }

  logger.log('[CallKeep] initCallKeep: calling CK.setup() — platform:', Platform.OS);
  try {
    await CK.setup({
      ios: {
        appName,
        supportsVideo: true,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
        includesCallsInRecents: true,
      },
      android: {
        alertTitle: 'Permissions required',
        alertDescription:
          'Emorii needs permission to show incoming calls on your screen.',
        cancelButton: 'Cancel',
        okButton: 'Allow',
        additionalPermissions: [],
        selfManaged: true,
        foregroundService: {
          channelId: 'calls',
          channelName: 'Incoming Calls',
          notificationTitle: 'Incoming Emorii call…',
          notificationIcon: 'ic_notification',
        },
      },
    });
    _initialized = true;
    logger.log('[CallKeep] Initialized — selfManaged: true');
  } catch (err) {
    logger.error('[CallKeep] setup() failed:', err);
  }
}

export function setupCallKeepListeners(handlers: {
  onAnswer: (callerId: string, callUUID: string) => void;
  onEnd: (callerId: string, callUUID: string) => void;
  onToggleMute?: (muted: boolean, callUUID: string) => void;
}) {
  const CK = loadCallKeep();
  if (!CK || Platform.OS === 'web') return;

  CK.addEventListener('answerCall', ({ callUUID }: { callUUID: string }) => {
    logger.log('[CallKeep] answerCall uuid:', callUUID);
    const callerId = getCallerIdByUUID(callUUID);
    CK.setCurrentCallActive(callUUID);
    handlers.onAnswer(callerId ?? callUUID, callUUID);
  });

  CK.addEventListener('endCall', ({ callUUID }: { callUUID: string }) => {
    logger.log('[CallKeep] endCall uuid:', callUUID);
    const callerId = getCallerIdByUUID(callUUID);
    handlers.onEnd(callerId ?? callUUID, callUUID);
    uuidMap.forEach((uuid, id) => {
      if (uuid === callUUID) uuidMap.delete(id);
    });
  });

  CK.addEventListener('didActivateAudioSession', () => {
    logger.log('[CallKeep] Audio session activated.');
  });

  if (handlers.onToggleMute) {
    const muteHandler = handlers.onToggleMute;
    CK.addEventListener(
      'didPerformSetMutedCallAction',
      ({ muted, callUUID }: { muted: boolean; callUUID: string }) => {
        muteHandler(muted, callUUID);
      },
    );
  }
}

export function removeCallKeepListeners() {
  const CK = loadCallKeep();
  if (!CK || Platform.OS === 'web') return;
  try {
    CK.removeEventListener('answerCall');
    CK.removeEventListener('endCall');
    CK.removeEventListener('didActivateAudioSession');
    CK.removeEventListener('didPerformSetMutedCallAction');
  } catch {}
}

export async function displayIncomingCall(
  callerId: string,
  callerName: string,
  hasVideo: boolean = false,
): Promise<string> {
  if (Platform.OS === 'web') return '';
  const CK = loadCallKeep();
  if (!CK) return '';

  if (!_initialized) await initCallKeep();

  const uuid = generateUUID();
  uuidMap.set(callerId, uuid);

  try {
    CK.displayIncomingCall(uuid, callerId, callerName, 'generic', hasVideo);
    logger.log('[CallKeep] displayIncomingCall — caller:', callerName, 'uuid:', uuid);
  } catch (err) {
    logger.error('[CallKeep] displayIncomingCall error:', err);
  }
  return uuid;
}

export function endCallKeepCall(callerId: string) {
  if (Platform.OS === 'web') return;
  const CK = loadCallKeep();
  if (!CK) return;
  const uuid = uuidMap.get(callerId);
  if (uuid) {
    try {
      CK.endCall(uuid);
    } catch {}
    uuidMap.delete(callerId);
  }
}

export function reportCallEnded(callerId: string) {
  if (Platform.OS === 'web') return;
  const CK = loadCallKeep();
  if (!CK) return;
  const uuid = uuidMap.get(callerId);
  if (uuid) {
    try {
      CK.reportEndCallWithUUID(uuid, 6);
    } catch {}
    uuidMap.delete(callerId);
  }
}

export function setCallActive(callerId: string) {
  if (Platform.OS === 'web') return;
  const CK = loadCallKeep();
  if (!CK) return;
  const uuid = uuidMap.get(callerId);
  if (uuid) {
    try {
      CK.setCurrentCallActive(uuid);
    } catch {}
  }
}

function getCallerIdByUUID(uuid: string): string | undefined {
  for (const [id, u] of uuidMap.entries()) {
    if (u === uuid) return id;
  }
  return undefined;
}

export function getUUIDForCaller(callerId: string) {
  return uuidMap.get(callerId);
}
