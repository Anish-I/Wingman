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

// Auto-logout on 401 with user notification
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isSigningOut) {
      const gen = signInGeneration;
      isSigningOut = true;
      showMessage({
        message: 'Session expired',
        description: 'Please sign in again to continue.',
        type: 'warning',
        duration: 4000,
      });
      // Only sign out if no new sign-in has occurred since we captured gen
      if (gen === signInGeneration) {
        signOut();
      } else {
        isSigningOut = false;
      }
    }
    return Promise.reject(error);
  }
);
