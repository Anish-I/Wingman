import { useEffect } from 'react';
import { Platform, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { showMessage } from 'react-native-flash-message';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';
import { getToken } from '@/lib/auth/utils';
import { getItem, removeItem } from '@/lib/storage';
import { purple, spacing, useThemeColors } from '@/components/ui/tokens';
import { fontScale } from '@/lib/responsive';

/**
 * OAuth callback route for web.
 *
 * Handles two distinct flows:
 * 1. Google Sign-In: ?code=...&clientState=... (or ?error=...&clientState=...)
 *    CSRF validated via locally-stored oauth_pending token.
 * 2. Composio app connection: ?app=... (redirected from server after OAuth)
 *    Already-authenticated users connecting a new app — routes to apps tab.
 */

export default function OAuthCallbackScreen() {
  const { surface, text: t } = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; error?: string; clientState?: string; app?: string }>();

  useEffect(() => {
    let code = params.code;
    let error = params.error;
    let clientState = params.clientState;
    let app = params.app;

    // Expo Router on web may not always parse query params from OAuth redirects,
    // so fall back to reading window.location directly.
    if (Platform.OS === 'web' && !code && !error && !app) {
      try {
        const url = new URL(window.location.href);
        code = url.searchParams.get('code') ?? undefined;
        error = url.searchParams.get('error') ?? undefined;
        clientState = url.searchParams.get('clientState') ?? undefined;
        app = url.searchParams.get('app') ?? undefined;
      } catch {
        // ignore parse errors
      }
    }

    // Composio app connection callback — user is already authenticated.
    // The server redirects here with ?app=<slug> after a successful OAuth flow.
    if (app && !code && !clientState) {
      router.replace('/(app)/apps' as any);
      return;
    }

    // Default return path depends on auth state: authenticated users go to
    // the apps tab, unauthenticated users continue onboarding.
    const defaultReturnTo = getToken() ? '/(app)/apps' : '/onboarding/permissions';

    // Validate CSRF state — the clientState in the URL must match what we stored
    // before initiating OAuth. This prevents login CSRF attacks where an attacker
    // crafts a callback URL with their own auth code.
    const pending = getItem<{ clientState: string }>('oauth_pending');
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

    // Derive return path from auth state — never trust client-writable storage
    // for redirect targets, as oauth_pending is not cryptographically signed and
    // could be forged via XSS to redirect to arbitrary paths.
    const returnTo = defaultReturnTo;

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
  }, [params.code, params.error, params.clientState, params.app, router]);

  const containerStyle = { backgroundColor: surface.bg };
  const statusTextStyle = { color: t.muted };

  return (
    <View style={[styles.container, containerStyle]}>
      <ActivityIndicator size="large" color={purple[500]} />
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
    marginTop: spacing.lg,
    fontFamily: 'Inter_400Regular',
    fontSize: fontScale(14),
  },
});
