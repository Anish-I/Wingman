import type { TokenType } from '@/lib/auth/utils';

import { AppState, Platform } from 'react-native';
import { create } from 'zustand';
import Env from 'env';
import { getToken, removeToken, setToken } from '@/lib/auth/utils';
import { getItem, setItem, removeItem } from '@/lib/storage';
import { createSelectors } from '@/lib/utils';

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1_000;
const PENDING_BLACKLIST_KEY = 'wingman_pending_blacklist';

/**
 * On web, pending blacklist is kept in memory only — writing JWTs to
 * localStorage would re-introduce the XSS exfiltration risk that the
 * in-memory token strategy is designed to prevent.
 *
 * On native, tokens are persisted to encrypted MMKV so they survive
 * app restarts and can be blacklisted on next launch.
 *
 * On web, a `pagehide` listener uses navigator.sendBeacon() to flush
 * any pending tokens before the tab closes, ensuring they still reach
 * the server even if the normal fetch retry hasn't completed yet.
 */
let webPendingBlacklist: string[] = [];
let webRetryTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Flush all pending blacklist tokens via navigator.sendBeacon().
 * sendBeacon is designed to survive page unloads where fetch would be cancelled.
 * The server accepts the token in the JSON body for this path.
 */
function flushPendingViaBeacon(): void {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
  for (const tok of webPendingBlacklist) {
    const blob = new Blob(
      [JSON.stringify({ token: tok })],
      { type: 'application/json' },
    );
    navigator.sendBeacon(`${Env.EXPO_PUBLIC_API_URL}/auth/logout`, blob);
  }
}

// Register pagehide listener once on web to flush pending tokens when the tab closes
if (Platform.OS === 'web' && typeof addEventListener === 'function') {
  addEventListener('pagehide', flushPendingViaBeacon);
}

const RETRY_INTERVAL_MS = 30_000;
const RETRY_MAX_TICKS = 20; // Stop after ~10 minutes to avoid leaking resources
let webRetryTicks = 0;
let nativeRetryTimer: ReturnType<typeof setInterval> | null = null;
let nativeRetryTicks = 0;

/**
 * Try to blacklist a single token via fetch. Returns true if the token
 * was successfully blacklisted (or the error is non-retryable).
 */
async function tryBlacklistOnce(tok: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${Env.EXPO_PUBLIC_API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return (
      res.ok ||
      (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429)
    );
  } catch {
    return false;
  }
}

/**
 * Start a periodic retry loop on web for tokens that exhausted their initial
 * retry attempts.  The loop auto-stops when the pending list is drained or
 * after RETRY_MAX_TICKS iterations to prevent indefinite resource usage.
 */
function startWebRetryLoop(): void {
  if (webRetryTimer) return;
  webRetryTicks = 0;
  webRetryTimer = setInterval(async () => {
    webRetryTicks++;
    const pending = [...webPendingBlacklist];
    if (pending.length === 0 || webRetryTicks > RETRY_MAX_TICKS) {
      clearInterval(webRetryTimer!);
      webRetryTimer = null;
      return;
    }
    for (const tok of pending) {
      if (await tryBlacklistOnce(tok)) {
        removePendingBlacklist(tok);
      }
    }
  }, RETRY_INTERVAL_MS);
}

/**
 * Start a periodic retry loop on native for tokens that exhausted their
 * initial retry attempts. Similar to startWebRetryLoop but reads pending
 * tokens from MMKV. Auto-stops when drained or after RETRY_MAX_TICKS.
 */
function startNativeRetryLoop(): void {
  if (nativeRetryTimer) return;
  nativeRetryTicks = 0;
  nativeRetryTimer = setInterval(async () => {
    nativeRetryTicks++;
    const pending = getPendingBlacklist();
    if (pending.length === 0 || nativeRetryTicks > RETRY_MAX_TICKS) {
      clearInterval(nativeRetryTimer!);
      nativeRetryTimer = null;
      return;
    }
    for (const tok of pending) {
      if (await tryBlacklistOnce(tok)) {
        removePendingBlacklist(tok);
      }
    }
  }, RETRY_INTERVAL_MS);
}

/**
 * Start the appropriate background retry loop for the current platform.
 */
function startBackgroundRetryLoop(): void {
  if (Platform.OS === 'web') {
    startWebRetryLoop();
  } else {
    startNativeRetryLoop();
  }
}

// On native, retry pending blacklist tokens when the app returns to foreground.
// This covers the case where the server was unreachable, retries exhausted,
// and the background retry loop also stopped — foregrounding the app gets
// another chance to invalidate the token server-side.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      const pending = getPendingBlacklist();
      if (pending.length > 0) {
        for (const tok of pending) {
          tryBlacklistOnce(tok).then((ok) => {
            if (ok) removePendingBlacklist(tok);
          });
        }
      }
    }
  });
}

function getPendingBlacklist(): string[] {
  if (Platform.OS === 'web') {
    return [...webPendingBlacklist];
  }
  return getItem<string[]>(PENDING_BLACKLIST_KEY) ?? [];
}

function addPendingBlacklist(token: string): void {
  if (Platform.OS === 'web') {
    if (!webPendingBlacklist.includes(token)) {
      webPendingBlacklist.push(token);
    }
    return;
  }
  const list = getPendingBlacklist();
  if (!list.includes(token)) {
    list.push(token);
    setItem(PENDING_BLACKLIST_KEY, list);
  }
}

function removePendingBlacklist(token: string): void {
  if (Platform.OS === 'web') {
    webPendingBlacklist = webPendingBlacklist.filter((t) => t !== token);
    return;
  }
  const list = getPendingBlacklist().filter((t) => t !== token);
  if (list.length === 0) {
    removeItem(PENDING_BLACKLIST_KEY);
  } else {
    setItem(PENDING_BLACKLIST_KEY, list);
  }
}

/**
 * Attempt to blacklist a token server-side, retrying with exponential backoff.
 * The token is persisted to MMKV so that if the app is killed mid-retry,
 * hydrate() will pick it up on next launch.
 * On web, the first attempt uses sendBeacon for reliability (survives tab close),
 * then falls back to fetch with retries.
 * Runs in the background so the UI logout is never delayed.
 */
async function blacklistToken(token: string): Promise<void> {
  addPendingBlacklist(token);

  // On web, fire a sendBeacon immediately as a best-effort that survives page unload.
  // We still proceed with the fetch retry loop to confirm success and clean up.
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob(
      [JSON.stringify({ token })],
      { type: 'application/json' },
    );
    navigator.sendBeacon(`${Env.EXPO_PUBLIC_API_URL}/auth/logout`, blob);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(`${Env.EXPO_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        removePendingBlacklist(token);
        return;
      }
      // Non-retryable client errors (except 408 Request Timeout & 429 Too Many Requests)
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        removePendingBlacklist(token);
        return;
      }
    } catch {
      // Network error — will retry
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
    }
  }
  // All retries exhausted — keep retrying in the background so the server
  // session is eventually invalidated instead of silently giving up.
  console.warn('[signOut] Failed to blacklist token after retries — scheduling background retry');
  startBackgroundRetryLoop();
}

type AuthState = {
  token: TokenType | null;
  status: 'idle' | 'signOut' | 'signIn';
  hydrated: boolean;
  hydrationError: string | null;
  signIn: (data: TokenType) => void;
  signOut: () => void;
  hydrate: () => Promise<void>;
};

const _useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  token: null,
  hydrated: false,
  hydrationError: null,
  signIn: (token) => {
    setToken(token);
    set({ status: 'signIn', token });
  },
  signOut: () => {
    // Idempotent: bail if we are already signed out so concurrent
    // callers (e.g. multiple 401 interceptors) cannot double-fire.
    if (get().status === 'signOut') return;
    const token = getToken();
    removeToken();
    set({ status: 'signOut', token: null });
    // Blacklist the token server-side with retry on failure
    if (token) {
      blacklistToken(token);
    }
  },
  hydrate: async () => {
    try {
      const userToken = getToken();
      if (userToken !== null) {
        get().signIn(userToken);
      }
      else {
        get().signOut();
      }
    }
    catch (e) {
      console.error('[hydrateAuth] Failed to read auth token:', e);
      const message =
        e instanceof Error ? e.message : 'Unable to read stored credentials';
      set({ status: 'signOut', token: null, hydrationError: message });
    }
    // Signal that hydration is complete so consumers can distinguish
    // "not yet hydrated" from a settled auth state.
    set({ hydrated: true });
    // Drain any tokens that failed to blacklist before the app was killed
    try {
      const pending = getPendingBlacklist();
      for (const tok of pending) {
        blacklistToken(tok);
      }
    } catch {
      // Storage may be unavailable — skip blacklist drain
    }
  },
}));

export const useAuthStore = createSelectors(_useAuthStore);

export const signOut = () => _useAuthStore.getState().signOut();
export const signIn = (token: TokenType) => _useAuthStore.getState().signIn(token);
export const hydrateAuth = () => _useAuthStore.getState().hydrate() as Promise<void>;
