import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding/welcome" />
      <Stack.Screen name="onboarding/phone" />
      <Stack.Screen name="onboarding/verify" />
      <Stack.Screen name="onboarding/connect" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="connect/[app]" />
    </Stack>
  );
}
