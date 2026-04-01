import { createMMKV } from 'react-native-mmkv';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_ALIAS = 'mmkv_encryption_key';
const SECURE_STORE_TIMEOUT_MS = 5_000;

let storage: ReturnType<typeof createMMKV> | null = null;
let initPromise: Promise<void> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`[storage] ${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function initStorage(): Promise<void> {
  if (storage) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (Platform.OS === 'web') {
      // Encrypt web MMKV with a per-session random key so data at rest in
      // localStorage is not readable by XSS scripts inspecting Storage APIs.
      // The key lives only in JS memory — same session scope as the in-memory
      // JWT token — so a page refresh clears both auth and cached data, which
      // is the accepted web trade-off (re-auth required on refresh).
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const webEncryptionKey = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      storage = createMMKV({ id: 'wingman-storage', encryptionKey: webEncryptionKey });
      return;
    }

    try {
      let encryptionKey = await withTimeout(
        SecureStore.getItemAsync(ENCRYPTION_KEY_ALIAS),
        SECURE_STORE_TIMEOUT_MS,
        'SecureStore.getItemAsync',
      );
      if (!encryptionKey) {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        encryptionKey = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        await withTimeout(
          SecureStore.setItemAsync(ENCRYPTION_KEY_ALIAS, encryptionKey),
          SECURE_STORE_TIMEOUT_MS,
          'SecureStore.setItemAsync',
        );
      }

      storage = createMMKV({ id: 'wingman-storage', encryptionKey });
    } catch (error) {
      initPromise = null;
      throw new Error(
        `[storage] Failed to initialise encrypted MMKV — refusing to fall back to unencrypted storage. Original error: ${error}`
      );
    }
  })();

  return initPromise;
}

export function getStorage(): ReturnType<typeof createMMKV> {
  if (!storage) {
    throw new Error('Storage not initialized. Call initStorage() first.');
  }
  return storage;
}

export function getItem<T>(key: string): T | null {
  if (!storage) return null;
  const value = storage.getString(key);
  return value ? JSON.parse(value) || null : null;
}

export function setItem<T>(key: string, value: T): void {
  if (!storage) return;
  storage.set(key, JSON.stringify(value));
}

export function removeItem(key: string): void {
  if (!storage) return;
  storage.remove(key);
}

export { storage };
