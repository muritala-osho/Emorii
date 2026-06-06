import logger from '@/utils/logger';
/**
 * VoIP Push Notification Service (iOS only)
 *
 * Uses react-native-voip-push-notification (PushKit) to receive a VoIP push
 * token and handle incoming VoIP pushes even when the app is completely killed.
 * When a VoIP push arrives the app is woken silently by iOS and we call
 * CallKeep.displayIncomingCall() to show the native CallKit UI.
 *
 * On Android the "killed app" path is handled via FCM high-priority data
 * messages and a React Native headless task registered in index.js.
 */

import { Platform } from 'react-native';
import { displayIncomingCall } from './callkeep';

let _voipToken: string | null = null;

export function getVoipPushToken(): string | null {
  return _voipToken;
}

export function registerVoipPushNotifications(
  onTokenReceived: (token: string) => void,
) {
  if (Platform.OS !== 'ios') return;

  let VoipPushNotification: any;
  try {
    VoipPushNotification = require('react-native-voip-push-notification').default;
  } catch (err) {
    logger.warn('[VoIP] react-native-voip-push-notification not available:', err);
    return;
  }

  VoipPushNotification.addEventListener('register', (token: string) => {
    logger.log('[VoIP] Registered token:', token);
    _voipToken = token;
    onTokenReceived(token);
  });

  VoipPushNotification.addEventListener('notification', (notification: any) => {
    logger.log('[VoIP] Received push (killed/background app):', notification);
    _handleVoipPush(notification);
    VoipPushNotification.onVoipNotificationCompleted(notification.uuid);
  });

  VoipPushNotification.addEventListener(
    'didLoadWithEvents',
    (events: { name: string; data: any }[]) => {
      if (!Array.isArray(events)) return;
      for (const event of events) {
        if (event.name === 'RNVoipPushRemoteNotificationsRegisteredEvent') {
          _voipToken = event.data;
          onTokenReceived(event.data);
        } else if (
          event.name === 'RNVoipPushRemoteNotificationReceivedEvent'
        ) {
          _handleVoipPush(event.data);
        }
      }
    },
  );

  VoipPushNotification.registerVoipToken();
}

function _handleVoipPush(payload: any) {
  const {
    callerId,
    callerName,
    callType,
    callData,
    uuid: pushUUID,
  } = payload ?? {};

  if (!callerId) return;

  const hasVideo = callType === 'video';
  displayIncomingCall(callerId, callerName ?? 'Unknown', hasVideo);

  (global as any).__pendingVoipCall = {
    callerId,
    callerName: callerName ?? 'Unknown',
    callType: callType ?? 'voice',
    callData: callData ?? {},
  };
}

export function unregisterVoipPushNotifications() {
  if (Platform.OS !== 'ios') return;
  try {
    const VoipPushNotification = require('react-native-voip-push-notification').default;
    VoipPushNotification.removeEventListener('register');
    VoipPushNotification.removeEventListener('notification');
    VoipPushNotification.removeEventListener('didLoadWithEvents');
  } catch {}
}
