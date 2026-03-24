import { useEffect } from 'react';
import { Platform, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { showMessage } from 'react-native-flash-message';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';
import { getItem, removeItem } from '@/lib/storage';
import { useThemeColors } from '@/components/ui/tokens';

/**
 * OAuth callback route for web.
 * The server redirects here with ?code=...&clientState=... on success,
 * or ?error=...&clientState=... on failure. The clientState is validated
 * against a locally-stored CSRF token before exchanging the code.
 */

const DEFAULT_RETURN_TO = '/onboarding/permissions';
const ALLOWED_RETURN_PATHS = ['/onboarding/permissions', '/(app)', '/(app)/apps', '/(app)/settings'];

export default function OAuthCallbackScreen() {
  const { surface, text: t } = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; clientState?: string }>();

  useEffect(() => {
    let code = params.code;
    let error = params.error;
    let clientState = params.clientState;

    // Expo Router on web may not always parse query params from OAuth redirects,
    // so fall back to reading window.location directly.
    if (Platform.OS === 'web' && !code && !error) {
      try {
        const url = new URL(window.location.href);
        code = url.searchParams.get('code') ?? undefined;
        error = url.searchParams.get('error') ?? undefined;
        clientState = url.searchParams.get('clientState') ?? undefined;
      } catch {
        // ignore parse errors
      }
    }

    // Validate CSRF state — the clientState in the URL must match what we stored
    // before initiating OAuth. This prevents login CSRF attacks where an attacker
    // crafts a callback URL with their own auth code.
    const pending = getItem<{ clientState: string; returnTo: string }>('oauth_pending');
    removeItem('oauth_pending'); // Always clear to prevent reuse

    if (!pending || !clientState || pending.clientState !== clientState) {
      showMessage({
        message: 'Sign-In Failed',
        description: 'OAuth session mismatch. Please try signing in again.',
        type: 'danger',
        duration: 4000,
      });
      router.replace('/onboarding/signup');
      return;
    }

    // Use stored returnTo for context-aware redirect (not from URL to prevent open redirect)
    const returnTo = (pending.returnTo && ALLOWED_RETURN_PATHS.includes(pending.returnTo))
      ? pending.returnTo
      : DEFAULT_RETURN_TO;

    if (error) {
      showMessage({
        message: 'Sign-In Failed',
        description: 'OAuth authorization failed. Please try again.',
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
          router.replace(returnTo as any);
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
  }, [params.code, params.error, params.clientState, router]);

  const containerStyle = { backgroundColor: surface.bg };
  const statusTextStyle = { color: t.muted };

  return (
    <View style={[styles.container, containerStyle]}>
      <ActivityIndicator size="large" color="#7C5CFC" />
      <Text style={[styles.statusText, statusTextStyle]}>
        Completing sign-in...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    marginTop: 16,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
});
