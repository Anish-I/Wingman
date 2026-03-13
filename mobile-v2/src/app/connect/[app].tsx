import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Env from 'env';

export default function ConnectAppScreen() {
  const { app } = useLocalSearchParams<{ app: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!app) { router.back(); return; }
    WebBrowser.openAuthSessionAsync(
      `${Env.EXPO_PUBLIC_API_URL}/connect/${app}`,
      'wingman://connect/callback'
    ).then((result) => {
      if (result.type === 'success') {
        router.replace('/(app)/apps');
      } else {
        router.back();
      }
    });
  }, [app]);

  return (
    <View className="flex-1 bg-background items-center justify-center">
      <ActivityIndicator color="#3B5998" size="large" />
    </View>
  );
}
