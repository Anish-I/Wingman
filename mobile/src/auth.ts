import { Platform } from 'react-native';

const TOKEN_KEY = 'wingman_jwt';

const isWeb = Platform.OS === 'web';

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
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(TOKEN_KEY);
  }
  const SecureStore = await getSecureStore();
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(TOKEN_KEY);
  } else {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return token !== null && isSessionToken(token);
}
