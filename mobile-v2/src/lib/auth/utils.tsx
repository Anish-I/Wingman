import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN = 'wingman_jwt';

export type TokenType = string;

/**
 * On web: JWT is stored in memory only — never written to localStorage.
 * This prevents XSS from exfiltrating tokens via document.cookie or Storage APIs.
 * Trade-off: page refresh requires re-authentication on web.
 *
 * On native: JWT is stored in expo-secure-store (Keychain / Keystore),
 * bypassing MMKV entirely for sensitive credentials.
 */

// In-memory store for web
let memoryToken: TokenType | null = null;

export const getToken = (): TokenType | null => {
  if (Platform.OS === 'web') {
    return memoryToken;
  }
  try {
    return SecureStore.getItem(TOKEN) ?? null;
  } catch {
    return null;
  }
};

export const setToken = (value: TokenType): void => {
  if (Platform.OS === 'web') {
    memoryToken = value;
    return;
  }
  SecureStore.setItem(TOKEN, value);
};

export const removeToken = (): void => {
  if (Platform.OS === 'web') {
    memoryToken = null;
    return;
  }
  SecureStore.deleteItemAsync(TOKEN).catch(() => {});
};
