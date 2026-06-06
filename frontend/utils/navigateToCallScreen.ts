import logger from '@/utils/logger';
import { navigationRef } from '@/utils/navigationRef';

/**
 * Navigate to VoiceCall or VideoCall reliably from any context — including
 * cold-start where the authenticated Stack.Navigator may not have mounted yet.
 *
 * Strategy:
 *  1. Retry every 300 ms until navigationRef.isReady().
 *  2. After each navigate() call, verify success 400 ms later by checking
 *     the current route name.  React Navigation navigate() is a silent no-op
 *     in production builds when the target route is not yet registered, so
 *     without this verification step the call screen never appears.
 *  3. If we are already on the target screen, stop immediately (prevents
 *     pushing a duplicate call screen on re-tries).
 *  4. Give up after 100 × 300 ms = 30 seconds and log a warning.
 *
 * Thread-safety: only one call-screen navigation can be in flight at a time.
 * A concurrent request for a DIFFERENT screen is ignored; a request for the
 * SAME screen just resets the in-flight guard (idempotent).
 */

let _inFlightScreen: string | null = null;

export function navigateToCallScreen(
  screen: string,
  params: Record<string, any>,
  attempt = 0,
): void {
  if (attempt === 0) {
    if (_inFlightScreen && _inFlightScreen !== screen) {
      logger.warn(
        '[navigateToCallScreen] Another call nav already in-flight for',
        _inFlightScreen,
        '— ignoring request for',
        screen,
      );
      return;
    }
    _inFlightScreen = screen;
    logger.log('[navigateToCallScreen] Starting navigation to', screen, '| params:', JSON.stringify(params));
  }

  const retry = () => {
    if (attempt < 100) {
      setTimeout(() => navigateToCallScreen(screen, params, attempt + 1), 300);
    } else {
      logger.warn('[navigateToCallScreen] Gave up after 30 s — screen:', screen);
      _inFlightScreen = null;
    }
  };

  if (!navigationRef.isReady()) {
    if (attempt === 0 || attempt % 10 === 0) {
      logger.log('[navigateToCallScreen] Navigator not ready yet (attempt', attempt, ') — waiting…');
    }
    retry();
    return;
  }

  const currentRoute = (navigationRef as any).getCurrentRoute?.();
  if (currentRoute?.name === screen) {
    logger.log('[navigateToCallScreen] Already on', screen, '— done');
    _inFlightScreen = null;
    return;
  }

  try {
    (navigationRef as any).navigate(screen, params);
    logger.log('[navigateToCallScreen] navigate(', screen, ') called on attempt', attempt);
  } catch (e) {
    logger.log('[navigateToCallScreen] navigate threw (attempt', attempt, '):', e);
    retry();
    return;
  }

  setTimeout(() => {
    const route = (navigationRef as any).getCurrentRoute?.();
    if (route?.name === screen) {
      logger.log('[navigateToCallScreen] Confirmed on', screen, 'after', attempt + 1, 'attempt(s)');
      _inFlightScreen = null;
    } else {
      logger.log(
        '[navigateToCallScreen] navigate() silently failed (currently on:',
        route?.name,
        ') — retrying attempt', attempt + 1,
      );
      navigateToCallScreen(screen, params, attempt + 1);
    }
  }, 400);
}
