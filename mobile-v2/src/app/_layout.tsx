import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import FlashMessage from 'react-native-flash-message';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useThemeConfig } from '@/components/ui/use-theme-config';
import { hydrateAuth } from '@/features/auth/use-auth-store';
import { APIProvider } from '@/lib/api';
import { loadSelectedTheme } from '@/lib/hooks/use-selected-theme';
import { initStorage } from '@/lib/storage';
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
        hydrateAuth();
        loadSelectedTheme();
      } catch (error) {
        console.error('[bootstrap] Failed to initialize app storage:', error);
      } finally {
        setReady(true);
      }
    }
    bootstrap();
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'web') {
      document.body.style.backgroundColor = '#0A0A0C';
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
        <View
          style={{
            flex: 1,
            backgroundColor: '#0A0A0C',
            alignItems: 'center',
            minHeight: '100vh' as any,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 430,
              flex: 1,
              overflow: 'hidden' as any,
            }}
          >
            {content}
          </View>
        </View>
      </Providers>
    );
  }

  return <Providers>{content}</Providers>;
}

function Providers({ children }: { children: React.ReactNode }) {
  const theme = useThemeConfig();
  return (
    <GestureHandlerRootView
      style={styles.container}
      className="dark"
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
