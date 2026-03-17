import { createMMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_ALIAS = 'mmkv_encryption_key';

let storage: ReturnType<typeof createMMKV> | null = null;

export async function initStorage(): Promise<void> {
  if (storage) return;

  let encryptionKey = await SecureStore.getItemAsync(ENCRYPTION_KEY_ALIAS);
  if (!encryptionKey) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    encryptionKey = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await SecureStore.setItemAsync(ENCRYPTION_KEY_ALIAS, encryptionKey);
  }

  storage = createMMKV({ id: 'wingman-storage', encryptionKey });
}

export function getStorage(): ReturnType<typeof createMMKV> {
  if (!storage) {
    throw new Error('Storage not initialized. Call initStorage() first.');
  }
  return storage;
}

export function getItem<T>(key: string): T | null {
  const value = getStorage().getString(key);
  return value ? JSON.parse(value) || null : null;
}

export async function setItem<T>(key: string, value: T) {
  getStorage().set(key, JSON.stringify(value));
}

export async function removeItem(key: string) {
  getStorage().remove(key);
}

export { storage };
