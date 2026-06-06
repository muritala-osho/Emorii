import * as SecureStore from 'expo-secure-store';
import { getApiBaseUrl } from '@/constants/config';

export const ACCESS_TOKEN_KEY = 'auth_token';
export const REFRESH_TOKEN_KEY = 'auth_refresh_token';

type TokenCallback = (token: string | null) => void;

let isRefreshing = false;
let refreshQueue: TokenCallback[] = [];
let onSessionExpiredCallback: (() => void) | null = null;
let onTokenRefreshedCallback: ((newToken: string) => void) | null = null;
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;

// Refresh ~60s before the token actually expires so a request that fires at
// the same moment never sees a 401. If the access token's lifetime is shorter
// than 90s we still leave 15s of headroom.
const REFRESH_LEAD_MS = 60 * 1000;
const MIN_REFRESH_LEAD_MS = 15 * 1000;

function drainQueue(token: string | null) {
  refreshQueue.forEach(cb => cb(token));
  refreshQueue = [];
}

// Keychain access options used for every SecureStore write. AFTER_FIRST_UNLOCK
// keeps the token readable after the user unlocks the device once after boot,
// which is what every "remember me" experience needs. Without it, iOS's
// default WHEN_UNLOCKED makes the keychain unreadable from background tasks
// or right after a quick wake — which we previously misread as "the user has
// no refresh token", and silently logged them out.
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

// Read a SecureStore item without ever throwing. We need to distinguish
// "the keychain returned null" (real logout) from "the keychain access
// failed" (transient — device just woke up, iOS race condition, etc.). The
// caller looks at .error to decide whether to treat the missing token as a
// definitive logout or as something to retry later.
async function safeGetItem(key: string): Promise<{ value: string | null; error: unknown | null }> {
  try {
    return { value: await SecureStore.getItemAsync(key), error: null };
  } catch (e) {
    return { value: null, error: e };
  }
}

export function setOnSessionExpired(cb: (() => void) | null) {
  onSessionExpiredCallback = cb;
}

export function setOnTokenRefreshed(cb: ((newToken: string) => void) | null) {
  onTokenRefreshedCallback = cb;
}

// Decode a JWT payload without pulling in a library. JWTs are
// header.payload.signature where each segment is base64url-encoded JSON.
// Returns the `exp` claim (seconds since epoch) or null on any parse failure.
function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decoded =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(padded)
        // Buffer is available in Hermes/Node but not in all RN configs;
        // atob is the primary path.
        : (require('buffer').Buffer.from(padded, 'base64').toString('utf8'));
    const json = JSON.parse(decoded);
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

function cancelProactiveRefresh() {
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
}

// Schedule a silent refresh to fire ~60s before the current access token
// expires. Replaces any previously-scheduled refresh.
function scheduleProactiveRefresh(token: string) {
  cancelProactiveRefresh();
  const expSec = decodeJwtExp(token);
  if (!expSec) return;
  const msUntilExpiry = expSec * 1000 - Date.now();
  // If the token is already expired or about to expire, refresh immediately.
  if (msUntilExpiry <= MIN_REFRESH_LEAD_MS) {
    tokenManager.refresh().catch(() => {});
    return;
  }
  const lead = Math.max(MIN_REFRESH_LEAD_MS, REFRESH_LEAD_MS);
  const delay = Math.max(1000, msUntilExpiry - lead);
  proactiveRefreshTimer = setTimeout(() => {
    tokenManager.refresh().catch(() => {});
  }, delay);
}

export const tokenManager = {
  async getAccessToken(): Promise<string | null> {
    const { value } = await safeGetItem(ACCESS_TOKEN_KEY);
    return value;
  },

  async setAccessToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token, SECURE_STORE_OPTIONS);
    scheduleProactiveRefresh(token);
  },

  async getRefreshToken(): Promise<string | null> {
    const { value } = await safeGetItem(REFRESH_TOKEN_KEY);
    return value;
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, SECURE_STORE_OPTIONS);
  },

  async clearTokens(): Promise<void> {
    cancelProactiveRefresh();
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {}),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {}),
    ]);
  },

  // Re-arm the proactive-refresh timer for an existing access token.
  // Called from useAuth on app launch (after loading the persisted token from
  // SecureStore) and from App.tsx when the app returns to the foreground.
  // If the token is already past its refresh window this fires a refresh now.
  armProactiveRefresh(token: string | null) {
    if (token) scheduleProactiveRefresh(token);
    else cancelProactiveRefresh();
  },

  // Returns true if the current access token will expire within the lead
  // window. Useful for "the app just woke up — should we refresh before
  // making any API calls?" checks from AppState handlers.
  isAccessTokenExpiringSoon(token: string | null): boolean {
    if (!token) return false;
    const expSec = decodeJwtExp(token);
    if (!expSec) return false;
    return expSec * 1000 - Date.now() <= REFRESH_LEAD_MS;
  },

  async refresh(): Promise<string | null> {
    if (isRefreshing) {
      return new Promise<string | null>(resolve => {
        refreshQueue.push(resolve);
      });
    }

    isRefreshing = true;
    try {
      const { value: refreshToken, error: storageError } = await safeGetItem(REFRESH_TOKEN_KEY);
      if (storageError) {
        // Couldn't even read the keychain. This happens on iOS when the
        // device just woke up, or during certain background-task races.
        // Treat as transient — DO NOT log the user out. Schedule a retry so
        // the app self-heals once the keychain is accessible again.
        drainQueue(null);
        proactiveRefreshTimer = setTimeout(() => {
          tokenManager.refresh().catch(() => {});
        }, 30 * 1000);
        return null;
      }
      if (!refreshToken) {
        // No refresh token at all = definitive logout state.
        await this.clearTokens();
        drainQueue(null);
        onSessionExpiredCallback?.();
        return null;
      }

      const baseUrl = getApiBaseUrl();
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Transient network failure (no internet, DNS, server cold start).
        // Do NOT clear tokens — let the next request try again. We also retry
        // the proactive refresh in 30s so the app self-heals once the
        // network comes back, even if the user isn't actively tapping.
        drainQueue(null);
        proactiveRefreshTimer = setTimeout(() => {
          tokenManager.refresh().catch(() => {});
        }, 30 * 1000);
        return null;
      }

      const data = await response.json().catch(() => ({}));

      // Only force the user out when the server explicitly tells us the
      // session is dead (`tokenRevoked: true`). A bare 401/403 from a proxy,
      // CDN, captive portal, or transient backend hiccup must NOT log them
      // out — that's what was causing random sign-outs on relaunch.
      if (data?.tokenRevoked === true) {
        await this.clearTokens();
        drainQueue(null);
        onSessionExpiredCallback?.();
        return null;
      }

      // Server error, rate limit, or any other non-OK response: keep tokens,
      // let the caller retry later instead of forcing logout. Re-arm the
      // proactive-refresh timer for the existing token so we'll try again.
      if (!response.ok || !data.success || !data.token) {
        drainQueue(null);
        const existing = await this.getAccessToken();
        if (existing) scheduleProactiveRefresh(existing);
        return null;
      }

      await this.setAccessToken(data.token);
      if (data.refreshToken) {
        await this.setRefreshToken(data.refreshToken);
      }
      // Notify the auth context so React state reflects the new token
      // immediately — without this, components reading `token` from context
      // would carry the old expired token until the next explicit re-render.
      onTokenRefreshedCallback?.(data.token);
      drainQueue(data.token);
      return data.token;
    } finally {
      isRefreshing = false;
    }
  },
};
