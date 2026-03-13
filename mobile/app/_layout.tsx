import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import { isAuthenticated } from '../src/auth';

export default function RootLayout() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    isAuthenticated().then((authed) => {
      setChecked(true);
      if (!authed) {
        router.replace('/onboarding/welcome');
      } else {
        router.replace('/(tabs)/chat');
      }
    });
  }, []);

  if (!checked) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding/welcome" />
      <Stack.Screen name="onboarding/phone" />
      <Stack.Screen name="onboarding/verify" />
      <Stack.Screen name="onboarding/connect" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="connect/[app]" />
    </Stack>
  );
}
