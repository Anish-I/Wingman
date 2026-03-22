import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import FlashMessage from 'react-native-flash-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useThemeConfig } from '@/components/ui/use-theme-config';
import { useThemeColors } from '@/components/ui/tokens';
import { hydrateAuth } from '@/features/auth/use-auth-store';
import { APIProvider } from '@/lib/api';
import { loadSelectedTheme } from '@/lib/hooks/use-selected-theme';
import { initStorage } from '@/lib/storage';
import { useUniwind } from 'uniwind';
import '../global.css';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(app)',
};

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

export default function RootLayout() {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    async function bootstrap() {
      try {
        await initStorage();
      } catch (error) {
        console.error('[bootstrap] Failed to initialize app storage:', error);
      }
      // Always hydrate auth even if storage init failed — hydrate() has its
      // own try/catch and will fall back to signOut, which prevents the app
      // from being stuck on 'idle' (rendering nothing) indefinitely.
      hydrateAuth();
      loadSelectedTheme();
      setReady(true);
    }
    bootstrap();
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'web') {
      document.body.style.margin = '0';
    }
  }, []);

  if (!ready) return null;

  const content = (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="connect" options={{ headerShown: false }} />
    </Stack>
  );

  if (Platform.OS === 'web') {
    return (
      <Providers>
        <ResponsiveWebShell>{content}</ResponsiveWebShell>
      </Providers>
    );
  }

  return <Providers>{content}</Providers>;
}

function ResponsiveWebShell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const { surface } = useThemeColors();
  // Phone (<768): full width, capped at 430px centered
  // Tablet (768–1024): 720px max
  // Desktop (>1024): 960px max
  const maxWidth = width < 768 ? 430 : width < 1024 ? 720 : 960;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: surface.bg,
        alignItems: 'center',
        minHeight: '100vh' as any,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth,
          flex: 1,
          overflow: 'hidden' as any,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Providers({ children }: { children: React.ReactNode }) {
  const theme = useThemeConfig();
  const { theme: colorScheme } = useUniwind();
  return (
    <GestureHandlerRootView
      style={styles.container}
      className={colorScheme === 'dark' ? 'dark' : ''}
    >
      <KeyboardProvider>
        <ThemeProvider value={theme}>
          <APIProvider>
            <BottomSheetModalProvider>
              {children}
              <FlashMessage position="top" />
            </BottomSheetModalProvider>
          </APIProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
