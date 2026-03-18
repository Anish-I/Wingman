import { Stack } from 'expo-router';
import { useFonts, NunitoSans_400Regular, NunitoSans_600SemiBold, NunitoSans_700Bold, NunitoSans_800ExtraBold } from '@expo-google-fonts/nunito-sans';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { colors } from '../src/theme';

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
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding/index" />
      <Stack.Screen name="onboarding/login" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding/phone" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding/verify" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding/welcome" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding/features" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding/signup" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding/connect" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding/permissions" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="onboarding/done" options={{ animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen name="connect/[app]" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
    </Stack>
  );
}
