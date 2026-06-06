/**
 * notifeeService.ts — Expo-notifications shim
 *
 * @notifee/react-native and @react-native-firebase/messaging have been removed.
 * All notification delivery now goes through expo-notifications exclusively.
 *
 * This module preserves the original export surface so call sites in
 * IncomingCallHandler, ChatDetailScreen, and App.tsx require no changes.
 */

import logger from '@/utils/logger';
import * as Notifications from 'expo-notifications';

// ── Active chat suppression ───────────────────────────────────────────────────
// Tracks which matchId conversation is currently open so the foreground
// notification handler can suppress duplicate chat banners.
let _activeChatMatchId: string | null = null;

export function setActiveChatMatchId(matchId: string | null): void {
  _activeChatMatchId = matchId;
}

export function getActiveChatMatchId(): string | null {
  return _activeChatMatchId;
}

// ── clearConversationThread ───────────────────────────────────────────────────
// Previously dismissed a Notifee MessagingStyle thread; now a no-op since
// expo-notifications renders each message as a standalone notification and
// Android groups them automatically by channelId.
export async function clearConversationThread(_matchId: string): Promise<void> {
  // no-op
}

// ── displayMissedCallNotification ────────────────────────────────────────────
export async function displayMissedCallNotification({
  callerId,
  callerName,
  callerPhoto,
  callType = 'voice',
  matchId,
}: {
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  callType?: string;
  matchId?: string;
}): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Missed call',
        body: `You missed a ${callType} call from ${callerName}`,
        data: {
          type: 'missed_call',
          callerId,
          callerName,
          callerPhoto: callerPhoto ?? '',
          callType,
          matchId: matchId ?? '',
        },
        sound: true,
      },
      trigger: null,
    });
    logger.log('[notifeeService] Missed call notification scheduled via expo-notifications');
  } catch (err: any) {
    logger.warn('[notifeeService] Failed to schedule missed call notification:', err?.message || err);
  }
}

// ── cancelIncomingCallNotification ───────────────────────────────────────────
export async function cancelIncomingCallNotification(_callerId: string): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (err: any) {
    logger.warn('[notifeeService] cancelIncomingCallNotification error:', err?.message || err);
  }
}

// ── cancelCallNotification ───────────────────────────────────────────────────
export async function cancelCallNotification(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (err: any) {
    logger.warn('[notifeeService] cancelCallNotification error:', err?.message || err);
  }
}

// ── stopCallForegroundService ─────────────────────────────────────────────────
// Foreground services are a Notifee concept; no-op with expo-notifications.
export async function stopCallForegroundService(): Promise<void> {
  // no-op
}

// ── startCallForegroundService ────────────────────────────────────────────────
export async function startCallForegroundService(_data: any): Promise<void> {
  // no-op
}

// ── displayMessageNotification ────────────────────────────────────────────────
// Previously rendered a Notifee MessagingStyle notification. Expo push
// notifications are now displayed natively by the OS without JS-side rendering.
export async function displayMessageNotification(_opts: {
  matchId: string;
  messageId: string;
  senderName: string;
  senderPhoto: string;
  body: string;
}): Promise<void> {
  // no-op — expo-notifications handles display
}

// ── displayIncomingCallNotification ──────────────────────────────────────────
export async function displayIncomingCallNotification(_opts: {
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  callType?: string;
  callData?: any;
}): Promise<void> {
  // no-op — incoming calls are handled via socket + IncomingCallHandler
}

// ── showIncomingCallNotification ──────────────────────────────────────────────
export async function showIncomingCallNotification(_data: any): Promise<void> {
  // no-op
}

// ── setupNotifeeForegroundEventHandler ───────────────────────────────────────
// Previously wired Notifee foreground press events to navigation. All
// navigation from notifications now comes through expo-notifications'
// addNotificationResponseReceivedListener in App.tsx.
export function setupNotifeeForegroundEventHandler(
  _onNavigate: (screen: string, params: any) => void
): () => void {
  return () => {};
}

// ── registerNotifeeBackgroundHandler ─────────────────────────────────────────
export function registerNotifeeBackgroundHandler(): void {
  // no-op
}

// ── registerFCMTokenAsync ─────────────────────────────────────────────────────
// No longer needed — Firebase SDK removed.
export async function registerFCMTokenAsync(_authToken?: string): Promise<void> {
  // no-op
}

// ── Constants / interfaces kept for call-site compatibility ──────────────────
export const CALL_NOTIFICATION_ID = 'incoming_call';

export interface IncomingCallData {
  callId: string;
  channelName: string;
  callerName: string;
  callType: string;
  appId: string;
  agoraToken?: string;
  token?: string;
  callerAvatar?: string;
  callerPhoto?: string;
  callerId?: string;
  matchId?: string;
  [key: string]: any;
}
