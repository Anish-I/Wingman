import type { TokenType } from '@/lib/auth/utils';

import { create } from 'zustand';
import Env from 'env';
import { getToken, removeToken, setToken } from '@/lib/auth/utils';
import { createSelectors } from '@/lib/utils';

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1_000;

/**
 * Attempt to blacklist a token server-side, retrying with exponential backoff.
 * Runs in the background so the UI logout is never delayed.
 */
async function blacklistToken(token: string): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${Env.EXPO_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) return;
      // Non-retryable client errors (except 408 Request Timeout & 429 Too Many Requests)
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) return;
    } catch {
      // Network error — will retry
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
    }
  }
  // All retries exhausted — token will expire naturally via JWT TTL
}

type AuthState = {
  token: TokenType | null;
  status: 'idle' | 'signOut' | 'signIn';
  signIn: (data: TokenType) => void;
  signOut: () => void;
  hydrate: () => void;
};

const _useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  token: null,
  signIn: (token) => {
    setToken(token);
    set({ status: 'signIn', token });
  },
  signOut: () => {
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
  },
}));

export const useAuthStore = createSelectors(_useAuthStore);

export const signOut = () => _useAuthStore.getState().signOut();
export const signIn = (token: TokenType) => _useAuthStore.getState().signIn(token);
export const hydrateAuth = () => _useAuthStore.getState().hydrate();

// Subscribe to sign-in events so the API client can reset its 401 guard
export const onSignIn = (callback: () => void) =>
  _useAuthStore.subscribe((state, prev) => {
    if (state.status === 'signIn' && prev.status !== 'signIn') {
      callback();
    }
  });
