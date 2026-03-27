import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform, Text, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/button';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { showMessage } from 'react-native-flash-message';
import * as WebBrowser from 'expo-web-browser';
import { AxiosError } from 'axios';
import Env from 'env';
import { client } from '@/lib/api/client';
import { getToken } from '@/lib/auth/utils';
import { layout, radii, semantic, spacing, useThemeColors } from '@/components/ui/tokens';
import { fontScale } from '@/lib/responsive';

export default function ConnectAppScreen() {
  const { surface, text: t } = useThemeColors();
  const { app } = useLocalSearchParams<{ app: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!app) { router.back(); return; }

    // Skip API call for demo tokens — they will always 401
    const token = getToken();
    if (token === 'demo-mock-token') {
      if (Platform.OS === 'web') {
        showMessage({ message: 'Demo Mode', description: `Connect ${app} requires a real account. Sign in with OTP first.`, type: 'info', duration: 3000 });
      }
      router.back();
      return;
    }

    (async () => {
      try {
        const { data } = await client.post<{ connectToken: string; sig: string; sessionBind: string }>('/connect/create-connect-token', { app });
        const redirectUrl = Platform.OS === 'web'
          ? `${window.location.origin}/connect/callback`
          : 'wingman://connect/callback';
        const result = await WebBrowser.openAuthSessionAsync(
          `${Env.EXPO_PUBLIC_API_URL}/connect/initiate?connectToken=${data.connectToken}&sig=${data.sig}&sessionBind=${data.sessionBind}`,
          redirectUrl
        );
        if (result.type === 'success') {
          router.replace('/(app)/apps');
        } else {
          router.back();
        }
      } catch (err) {
        if (err instanceof AxiosError && err.response?.status === 401) {
          setError('Session expired. Please sign in again.');
        } else {
          setError('Could not connect app. Please try again.');
        }
      }
    })();
  }, [app]);

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    errorContainer: { backgroundColor: surface.bg },
    goBackButton: { backgroundColor: surface.section },
    goBackLabel: { color: t.primary },
    loadingContainer: { backgroundColor: surface.bg },
  };

  if (error) {
    return (
      <View style={[styles.errorContainer, themed.errorContainer]}>
        <Text style={styles.errorText}>
          {error}
        </Text>
        <Button
          variant="link"
          size="sm"
          label="Go Back"
          fullWidth={false}
          onPress={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.loadingContainer, themed.loadingContainer]}>
      <ActivityIndicator color={semantic.info} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPaddingH,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: fontScale(16),
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  goBackButton: {
    paddingHorizontal: layout.screenPaddingH,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  goBackLabel: {
    fontSize: fontScale(14),
    fontFamily: 'Inter_500Medium',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
