import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Env from 'env';
import { client } from '@/lib/api/client';

export default function ConnectAppScreen() {
  const { app } = useLocalSearchParams<{ app: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!app) { router.back(); return; }
    (async () => {
      try {
        // Create a short-lived, single-use connect token (avoids JWT in URL)
        const { data } = await client.post<{ connectToken: string }>('/connect/create-connect-token', { app });
        const result = await WebBrowser.openAuthSessionAsync(
          `${Env.EXPO_PUBLIC_API_URL}/connect/initiate?connectToken=${data.connectToken}`,
          'wingman://connect/callback'
        );
        if (result.type === 'success') {
          router.replace('/(app)/apps');
        } else {
          router.back();
        }
      } catch {
        router.back();
      }
    })();
  }, [app]);

  return (
    <View className="flex-1 bg-background items-center justify-center">
      <ActivityIndicator color="#4A7BD9" size="large" />
    </View>
  );
}
