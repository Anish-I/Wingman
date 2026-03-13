import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function ConnectAppScreen() {
  const { app } = useLocalSearchParams<{ app: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!app) { router.back(); return; }
    WebBrowser.openAuthSessionAsync(
      `${BASE}/connect/${app}`,
      'wingman://connect/callback'
    ).then((result) => {
      if (result.type === 'success') {
        router.replace('/(tabs)/apps');
      } else {
        router.back();
      }
    });
  }, [app]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color="#6c63ff" size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', alignItems: 'center', justifyContent: 'center' },
});
