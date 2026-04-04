import { Platform } from 'react-native';

const TOKEN_KEY = 'wingman_jwt';

const isWeb = Platform.OS === 'web';
let memoryToken: string | null = null;

function isSessionToken(token: string): boolean {
  if (token.startsWith('demo.')) return false;

  const parts = token.split('.');
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

async function getSecureStore() {
  return await import('expo-secure-store');
}

export async function saveToken(token: string): Promise<void> {
  if (isWeb) {
    memoryToken = token;
  } else {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (isWeb) {
    return memoryToken;
  }
  const SecureStore = await getSecureStore();
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  if (isWeb) {
    memoryToken = null;
  } else {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return token !== null && isSessionToken(token);
}
