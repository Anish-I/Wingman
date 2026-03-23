import axios from 'axios';
import Env from 'env';
import { showMessage } from 'react-native-flash-message';
import { getToken } from '@/lib/auth/utils';
import { signOut, onSignIn } from '@/features/auth/use-auth-store';

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
// Set true on first 401 sign-out; cleared when a new sign-in occurs
// (not on a timer, which would create a re-trigger window).
let isSigningOut = false;

onSignIn(() => {
  isSigningOut = false;
});

// Auto-logout on 401 with user notification
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isSigningOut) {
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
