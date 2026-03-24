import axios from 'axios';
import Env from 'env';
import { showMessage } from 'react-native-flash-message';
import { getToken } from '@/lib/auth/utils';
import { signOut } from '@/features/auth/use-auth-store';

export const client = axios.create({
  baseURL: Env.EXPO_PUBLIC_API_URL,
  timeout: 10_000,
});

client.interceptors.request.use((config) => {
  try {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Stamp request with the token it was sent with so the 401 handler
    // can tell whether the request belongs to the current session.
    (config as any).__requestToken = token;
  } catch {
    // Storage not yet initialized
  }
  return config;
});

// Auto-logout on 401 — uses token identity to prevent double sign-out.
//
// Each request is stamped with the token it was issued under. When a 401
// arrives, we compare the request's token to the *current* token. If they
// still match, this is the first 401 for this session: signOut() removes
// the token (making getToken() return null), so any subsequent concurrent
// 401 from the same session will see a mismatch and be ignored.
//
// signOut() itself is also idempotent (guards on store status), providing
// a second layer of protection.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestToken = (error.config as any)?.__requestToken;
      if (requestToken != null && requestToken === getToken()) {
        signOut();
        showMessage({
          message: 'Session expired',
          description: 'Please sign in again to continue.',
          type: 'warning',
          duration: 4000,
        });
      }
    }
    return Promise.reject(error);
  }
);
