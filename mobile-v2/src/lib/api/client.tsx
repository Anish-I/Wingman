import axios from 'axios';
import Env from 'env';
import { showMessage } from 'react-native-flash-message';
import { getToken } from '@/lib/auth/utils';
import { signOut } from '@/features/auth/use-auth-store';

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

// Debounce 401 sign-outs so concurrent failures don't race
let isSigningOut = false;

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
      // Reset after a short delay so a genuinely new session can still be invalidated
      setTimeout(() => {
        isSigningOut = false;
      }, 2000);
    }
    return Promise.reject(error);
  }
);
