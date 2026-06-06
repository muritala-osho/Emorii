/**
 * firebaseMessaging.ts — no-op stub
 *
 * Firebase Cloud Messaging (direct data messages) has been removed.
 * All push notifications are now delivered exclusively via Expo push notifications.
 * This stub preserves the module export surface so no other file needs to change its imports.
 */

export function registerFirebaseBackgroundHandler(): void {}

export async function requestFCMPermissionAndGetToken(): Promise<string | null> {
  return null;
}

export async function refreshFcmTokenWithBackend(
  _getAuthToken: () => Promise<string | null>,
  _apiBaseUrl: string,
): Promise<void> {}

export function subscribeToFcmTokenRefresh(
  _getAuthToken: () => Promise<string | null>,
  _apiBaseUrl: string,
): () => void {
  return () => {};
}

export function onForegroundMessage(
  _handler: (message: any) => void,
): () => void {
  return () => {};
}
