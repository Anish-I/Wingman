import { Redirect } from 'expo-router';
import { useAuthStore } from '@/features/auth/use-auth-store';

export default function Index() {
  const status = useAuthStore.use.status();
  const token = useAuthStore.use.token();

  // Wait for auth hydration before deciding where to go
  if (status === 'idle') {
    return null;
  }

  // Not authenticated — send to login instead of protected route
  if (status === 'signOut' || !token) {
    return <Redirect href="/login" />;
  }

  // Authenticated with valid token — proceed to protected tabs
  return <Redirect href="/(app)/chat" />;
}
