import type { TokenType } from '@/lib/auth/utils';

import { create } from 'zustand';
import Env from 'env';
import { getToken, removeToken, setToken } from '@/lib/auth/utils';
import { createSelectors } from '@/lib/utils';

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
    // Fire-and-forget: tell server to blacklist the token in Redis
    if (token) {
      fetch(`${Env.EXPO_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
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
