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

// --- JWT expiry helpers ---

/** Decode the payload of a JWT without verifying the signature. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 → decode
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/** Buffer (in seconds) before actual expiry to treat the token as expired. */
const EXPIRY_BUFFER_SECONDS = 30;

/** Returns true if the token's `exp` claim is within the expiry buffer. */
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return Date.now() >= (payload.exp - EXPIRY_BUFFER_SECONDS) * 1000;
}

// --- Token refresh logic ---
// Serialises concurrent refresh attempts so only one is in-flight at a time.
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

client.interceptors.request.use(async (config) => {
  try {
    let token = getToken();

    // Proactively refresh or sign out if the token is expired / about to expire
    if (token && isTokenExpired(token)) {
      // Coalesce with any in-flight refresh
      if (!refreshPromise) {
        refreshPromise = tryRefreshToken(token).finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;

      if (newToken) {
        token = newToken;
      } else {
        // Refresh failed — sign out and abort this request
        signOut();
        showMessage({
          message: 'Session expired',
          description: 'Please sign in again to continue.',
          type: 'warning',
          duration: 4000,
        });
        const controller = new AbortController();
        controller.abort();
        config.signal = controller.signal;
        return config;
      }
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Stamp request with the token it was sent with so the 401 handler
    // can tell whether the request belongs to the current session.
    (config as any).__requestToken = token;
  } catch (err) {
    // Log unexpected interceptor errors instead of silently swallowing them.
    // getToken() is safe to call before storage init (returns null), so
    // errors here indicate a real problem worth surfacing.
    console.warn('[api] request interceptor error:', err);
  }
  return config;
});

// Auto-logout on 401 — uses token identity to prevent double sign-out.
//
// Before signing out, attempts a single token refresh. If the refresh
// succeeds the original request is retried transparently. If it fails
// (e.g. token was revoked, not just expired) we proceed with sign-out.
//
// A dedicated signOutPromise serialises the sign-out path so that when
// multiple in-flight requests all 401 at once, only the first one
// triggers signOut + the toast; the rest simply reject.
let signOutPromise: Promise<void> | null = null;

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      __requestToken?: string | null;
      __retried?: boolean;
    };

    if (error.response?.status === 401 && originalRequest && !originalRequest.__retried) {
      const requestToken = originalRequest.__requestToken;

      // If a sign-out is already in progress, skip all retry/refresh logic.
      if (signOutPromise) {
        return Promise.reject(error);
      }

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

        // Refresh failed — atomically claim the sign-out so concurrent
        // 401 handlers that are awaiting the same refreshPromise will
        // see signOutPromise set and bail out above on their next check.
        if (!signOutPromise) {
          signOutPromise = Promise.resolve().then(() => {
            signOut();
            showMessage({
              message: 'Session expired',
              description: 'Please sign in again to continue.',
              type: 'warning',
              duration: 4000,
            });
            // Keep the guard active briefly so late-arriving 401s are
            // suppressed, then reset for the next session.
            setTimeout(() => { signOutPromise = null; }, 2000);
          });
        }

        await signOutPromise;
      }
    }

    return Promise.reject(error);
  },
);
