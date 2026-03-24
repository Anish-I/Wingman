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
import { hydrateAuth, useAuthStore } from '@/features/auth/use-auth-store';
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
      let storageReady = true;
      try {
        await initStorage();
      } catch (error) {
        console.error('[bootstrap] Failed to initialize app storage:', error);
        storageReady = false;
      }
      if (storageReady) {
        hydrateAuth();
      } else {
        // Storage is unavailable — skip hydration (which would throw accessing
        // null storage) and force signOut directly so the app never stays in
        // the 'idle' state rendering nothing.
        useAuthStore.setState({ status: 'signOut', token: null });
      }
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
  // Phone (<768): full width (no cap — content fills the screen)
  // Tablet (768–1199): 92% of viewport width (scales with device)
  // Desktop (≥1200): 80% of viewport, capped at 1400px
  const maxWidth =
    width < 768 ? '100%' : width < 1200 ? Math.round(width * 0.92) : Math.min(Math.round(width * 0.8), 1400);

  const outerDynamicStyle = { backgroundColor: surface.bg };
  const innerDynamicStyle = { maxWidth } as any;

  return (
    <View
      style={[styles.shellOuter, outerDynamicStyle]}
    >
      <View
        style={[styles.shellInner, innerDynamicStyle]}
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
  shellOuter: {
    flex: 1,
    alignItems: 'center',
    minHeight: '100vh' as any,
  },
  shellInner: {
    width: '100%',
    flex: 1,
    overflow: 'hidden' as any,
  },
});
