import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Env from 'env';
import { showMessage } from 'react-native-flash-message';
import { getToken, setToken } from '@/lib/auth/utils';
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

// --- Token refresh logic ---
// Serialises concurrent 401s so only one refresh request is in-flight at a time.
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(failedToken: string): Promise<string | null> {
  try {
    const res = await axios.post(
      `${Env.EXPO_PUBLIC_API_URL}/auth/refresh`,
      null,
      {
        headers: { Authorization: `Bearer ${failedToken}` },
        timeout: 10_000,
      },
    );
    const newToken: string | undefined = res.data?.token;
    if (newToken) {
      setToken(newToken);
      return newToken;
    }
    return null;
  } catch {
    return null;
  }
}

// Auto-logout on 401 — uses token identity to prevent double sign-out.
//
// Before signing out, attempts a single token refresh. If the refresh
// succeeds the original request is retried transparently. If it fails
// (e.g. token was revoked, not just expired) we proceed with sign-out.
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      __requestToken?: string | null;
      __retried?: boolean;
    };

    if (error.response?.status === 401 && originalRequest && !originalRequest.__retried) {
      const requestToken = originalRequest.__requestToken;

      // Only attempt refresh if the request was authenticated and the token
      // is still the current one (no other 401 handler already signed out).
      if (requestToken != null && requestToken === getToken()) {
        originalRequest.__retried = true;

        // Coalesce concurrent refresh attempts
        if (!refreshPromise) {
          refreshPromise = tryRefreshToken(requestToken).finally(() => {
            refreshPromise = null;
          });
        }

        const newToken = await refreshPromise;

        if (newToken) {
          // Retry the original request with the fresh token
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          (originalRequest as any).__requestToken = newToken;
          return client(originalRequest);
        }

        // Refresh failed — sign out
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
  },
);
