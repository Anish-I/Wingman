import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { showMessage } from 'react-native-flash-message';
import * as WebBrowser from 'expo-web-browser';
import { AxiosError } from 'axios';
import Env from 'env';
import { client } from '@/lib/api/client';
import { getToken } from '@/lib/auth/utils';
import { useThemeColors } from '@/components/ui/tokens';

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
        const { data } = await client.post<{ connectToken: string }>('/connect/create-connect-token', { app });
        const redirectUrl = Platform.OS === 'web'
          ? `${window.location.origin}/connect/callback`
          : 'wingman://connect/callback';
        const result = await WebBrowser.openAuthSessionAsync(
          `${Env.EXPO_PUBLIC_API_URL}/connect/initiate?connectToken=${data.connectToken}`,
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

  const errorContainerStyle = { backgroundColor: surface.bg };
  const goBackButtonStyle = { backgroundColor: surface.section };
  const goBackLabelStyle = { color: t.primary };
  const loadingContainerStyle = { backgroundColor: surface.bg };

  if (error) {
    return (
      <View style={[styles.errorContainer, errorContainerStyle]}>
        <Text style={styles.errorText}>
          {error}
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[
            styles.goBackButton,
            goBackButtonStyle,
            Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined,
          ]}
        >
          <Text style={[styles.goBackLabel, goBackLabelStyle]}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.loadingContainer, loadingContainerStyle]}>
      <ActivityIndicator color="#6B9BEF" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
    marginBottom: 16,
  },
  goBackButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  goBackLabel: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
