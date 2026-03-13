import { Stack } from 'expo-router';
import { useFonts, NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold, NunitoSans_800ExtraBold } from '@expo-google-fonts/nunito-sans';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    NunitoSans_400Regular,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding/welcome" />
      <Stack.Screen name="onboarding/features" />
      <Stack.Screen name="onboarding/signup" />
      <Stack.Screen name="onboarding/phone" />
      <Stack.Screen name="onboarding/verify" />
      <Stack.Screen name="onboarding/connect" />
      <Stack.Screen name="onboarding/permissions" />
      <Stack.Screen name="onboarding/done" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="connect/[app]" />
    </Stack>
  );
}
