import { createMMKV } from 'react-native-mmkv';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_ALIAS = 'mmkv_encryption_key';

let storage: ReturnType<typeof createMMKV> | null = null;

export async function initStorage(): Promise<void> {
  if (storage) return;

  if (Platform.OS === 'web') {
    storage = createMMKV({ id: 'wingman-storage' });
    return;
  }

  try {
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
  } catch (error) {
    throw new Error(
      `[storage] Failed to initialise encrypted MMKV — refusing to fall back to unencrypted storage. Original error: ${error}`
    );
  }
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

export function setItem<T>(key: string, value: T): void {
  getStorage().set(key, JSON.stringify(value));
}

export function removeItem(key: string): void {
  getStorage().remove(key);
}

export { storage };
