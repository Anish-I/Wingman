import type { TokenType } from '@/lib/auth/utils';

import { Platform } from 'react-native';
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
 */
let webPendingBlacklist: string[] = [];

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
 * Runs in the background so the UI logout is never delayed.
 */
async function blacklistToken(token: string): Promise<void> {
  addPendingBlacklist(token);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${Env.EXPO_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
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
  // All retries exhausted — token stays in pending list for next hydrate()
}

type AuthState = {
  token: TokenType | null;
  status: 'idle' | 'signOut' | 'signIn';
  hydrated: boolean;
  signIn: (data: TokenType) => void;
  signOut: () => void;
  hydrate: () => void;
};

const _useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  token: null,
  hydrated: false,
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
  hydrate: () => {
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
      console.error(e);
      set({ status: 'signOut', token: null });
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
export const hydrateAuth = () => _useAuthStore.getState().hydrate();
