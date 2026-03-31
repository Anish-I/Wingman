import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TOKEN = 'wingman_jwt';

export type TokenType = string;

/**
 * Validate that a JWT contains the required claims for a Wingman auth token.
 * Checks structure (three base64url segments) AND decodes the payload to verify
 * that essential claims (exp, userId) are present and well-typed.
 * This prevents storing a structurally valid but claim-invalid token that would
 * immediately 401 on the first API call.
 */
export function isValidAuthToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  // Verify each segment is non-empty base64url
  if (!parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p))) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    // Server always sets: userId (number), exp (number from expiresIn)
    return (
      typeof payload === 'object' &&
      payload !== null &&
      typeof payload.exp === 'number' &&
      typeof payload.userId === 'number'
    );
  } catch {
    return false;
  }
}

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
