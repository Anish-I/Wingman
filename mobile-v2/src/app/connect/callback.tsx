import { useEffect } from 'react';
import { Platform, View, Text, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { showMessage } from 'react-native-flash-message';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';

/**
 * OAuth callback route for web.
 * The server redirects here with ?code=... (short-lived auth code) on success,
 * or ?error=... on failure. The code is exchanged for a JWT via POST /auth/exchange-code.
 */
export default function OAuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();

  useEffect(() => {
    let code = params.code;
    let error = params.error;

    // Expo Router on web may not always parse query params from OAuth redirects,
    // so fall back to reading window.location directly.
    if (Platform.OS === 'web' && !code && !error) {
      try {
        const url = new URL(window.location.href);
        code = url.searchParams.get('code') ?? undefined;
        error = url.searchParams.get('error') ?? undefined;
      } catch {
        // ignore parse errors
      }
    }

    if (error) {
      showMessage({
        message: 'Sign-In Failed',
        description: `OAuth error: ${error.replace(/_/g, ' ')}`,
        type: 'danger',
        duration: 4000,
      });
      router.replace('/onboarding/signup');
      return;
    }

    if (!code) {
      showMessage({
        message: 'Sign-In Failed',
        description: 'No authorization code received. Please try again.',
        type: 'danger',
        duration: 4000,
      });
      router.replace('/onboarding/signup');
      return;
    }

    // Exchange the short-lived code for a JWT
    client.post('/auth/exchange-code', { code })
      .then((res) => {
        const { token } = res.data;
        if (token) {
          signIn(token);
          router.replace('/onboarding/permissions');
        } else {
          throw new Error('No token in response');
        }
      })
      .catch(() => {
        showMessage({
          message: 'Sign-In Failed',
          description: 'Authorization code expired or invalid. Please try again.',
          type: 'danger',
          duration: 4000,
        });
        router.replace('/onboarding/signup');
      });
  }, [params.code, params.error, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C0C0C' }}>
      <ActivityIndicator size="large" color="#4A7BD9" />
      <Text style={{ color: '#8A8A8A', marginTop: 16, fontFamily: 'Inter_400Regular', fontSize: 14 }}>
        Completing sign-in...
      </Text>
    </View>
  );
}
