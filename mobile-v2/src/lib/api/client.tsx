import axios from 'axios';
import Env from 'env';
import { showMessage } from 'react-native-flash-message';
import { getToken } from '@/lib/auth/utils';
import { signOut, onSignIn } from '@/features/auth/use-auth-store';

// Monotonic session counter — incremented on each sign-in.
// The 401 handler captures the current value and only signs out if
// the counter hasn't changed, preventing stale onSignIn callbacks
// from a previous session from clearing the guard prematurely.
let signInGeneration = 0;

export const client = axios.create({
  baseURL: Env.EXPO_PUBLIC_API_URL,
});

client.interceptors.request.use((config) => {
  try {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Storage not yet initialized
  }
  // Tag each request with the current sign-in generation so the 401
  // handler can tell whether the request belongs to the current session.
  (config as any).__signInGeneration = signInGeneration;
  return config;
});

// Guard against concurrent 401s triggering multiple sign-outs.
// Uses a generation counter so only the first 401 per session triggers
// sign-out, and a new sign-in cleanly starts a new generation.
let isSigningOut = false;

onSignIn(() => {
  signInGeneration++;
  isSigningOut = false;
});

// Auto-logout on 401 with user notification.
// Uses the generation stamped at request time to ignore stale 401s from
// requests that were sent before the user signed back in.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestGen = (error.config as any)?.__signInGeneration;
    if (
      error.response?.status === 401 &&
      !isSigningOut &&
      requestGen === signInGeneration
    ) {
      isSigningOut = true;
      showMessage({
        message: 'Session expired',
        description: 'Please sign in again to continue.',
        type: 'warning',
        duration: 4000,
      });
      signOut();
    }
    return Promise.reject(error);
  }
);
