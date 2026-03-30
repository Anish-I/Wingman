import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import FlashMessage, { showMessage } from 'react-native-flash-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useThemeConfig } from '@/components/ui/use-theme-config';
import { useThemeColors } from '@/components/ui/tokens';
import { hydrateAuth, useAuthStore as _useAuthStore } from '@/features/auth/use-auth-store';
import { hydrateChat } from '@/features/chat/store';
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
        try {
          hydrateChat();
        } catch (error) {
          console.error('[bootstrap] hydrateChat failed:', error);
        }
        try {
          await hydrateAuth();
        } catch (error) {
          console.error('[bootstrap] hydrateAuth failed:', error);
          const message =
            error instanceof Error ? error.message : 'Failed to restore session';
          _useAuthStore.setState({
            status: 'signOut',
            token: null,
            hydrated: true,
            hydrationError: message,
          });
        }
      } else {
        // Storage is unavailable — skip hydration (which would throw accessing
        // null storage) and force signOut directly so the app never stays in
        // the 'idle' state rendering nothing.
        _useAuthStore.setState({
          status: 'signOut',
          token: null,
          hydrated: true,
          hydrationError: 'Storage initialization failed. Please restart the app.',
        });
      }
      // Ensure auth state settled before revealing the app.  If hydration
      // failed silently (e.g. future async change), force a safe fallback so
      // the splash screen never hangs and no flicker occurs.
      if (!_useAuthStore.getState().hydrated) {
        _useAuthStore.setState({
          status: 'signOut',
          token: null,
          hydrated: true,
          hydrationError: 'Session could not be restored. Please sign in again.',
        });
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

  const hydrated = _useAuthStore((s) => s.hydrated);
  const hydrationError = _useAuthStore((s) => s.hydrationError);

  React.useEffect(() => {
    if (hydrationError) {
      showMessage({
        message: 'Session error',
        description: hydrationError,
        type: 'danger',
        duration: 5000,
      });
      // Clear the error so it doesn't re-show on re-render
      _useAuthStore.setState({ hydrationError: null });
    }
  }, [hydrationError]);

  // Keep splash screen visible until bootstrap completes AND auth state is
  // fully hydrated.  This prevents the (app) layout from mounting in the
  // ambiguous 'idle' state which previously caused a flash of blank/wrong screen.
  if (!ready || !hydrated) return null;

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
