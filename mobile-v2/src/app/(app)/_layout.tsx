import { Ionicons } from '@expo/vector-icons';
import { Redirect, SplashScreen, Tabs } from 'expo-router';
import * as React from 'react';
import { useCallback, useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { purple, spacing, useThemeColors } from '@/components/ui/tokens';
import { useAuthStore as useAuth } from '@/features/auth/use-auth-store';
import { useIsFirstTime } from '@/lib/hooks/use-is-first-time';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Ionicons name={name} color={color} size={22} />;
}

export default function TabLayout() {
  const { surface, text: t } = useThemeColors();
  const hydrated = useAuth.use.hydrated();
  const status = useAuth.use.status();
  const token = useAuth.use.token();
  const [isFirstTime] = useIsFirstTime();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const hideSplash = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  // Determine all redirect conditions up-front so splash only hides once the
  // user is on the correct final screen (tabs), not during a redirect.
  const needsLogin = !hydrated || status === 'idle' || status === 'signOut' || !token;
  const needsOnboarding = !needsLogin && isFirstTime !== false;
  const showTabs = !needsLogin && !needsOnboarding;

  useEffect(() => {
    if (showTabs) {
      const timer = setTimeout(() => {
        hideSplash();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hideSplash, showTabs]);

  if (!hydrated || status === 'idle') {
    return null; // Splash screen remains visible via preventAutoHideAsync
  }
  // Guard: redirect to login if signed out OR if token is missing/empty
  if (status === 'signOut' || !token) {
    return <Redirect href="/login" />;
  }
  if (isFirstTime !== false) {
    return <Redirect href="/onboarding/welcome" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: [
          layoutStyles.tabBar,
          {
            backgroundColor: surface.bg,
            borderTopColor: surface.border,
            height: isLandscape ? 44 : 72,
            paddingBottom: isLandscape ? spacing.xs / 2 : spacing.sm,
            paddingTop: isLandscape ? spacing.xs / 2 : spacing.sm,
          },
        ],
        tabBarActiveTintColor: purple[500],
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: [
          layoutStyles.tabBarLabel,
          { fontSize: isLandscape ? 10 : 12 },
        ],
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => <TabIcon name="chatbubble-ellipses" color={color} />,
          tabBarButtonTestID: 'chat-tab',
        }}
      />
      <Tabs.Screen
        name="apps"
        options={{
          title: 'Apps',
          tabBarIcon: ({ color }) => <TabIcon name="grid" color={color} />,
          tabBarButtonTestID: 'apps-tab',
        }}
      />
      <Tabs.Screen
        name="workflows"
        options={{
          title: 'Workflows',
          tabBarIcon: ({ color }) => <TabIcon name="flash" color={color} />,
          tabBarButtonTestID: 'workflows-tab',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon name="settings-sharp" color={color} />,
          tabBarButtonTestID: 'settings-tab',
        }}
      />
    </Tabs>
  );
}

const layoutStyles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    elevation: 0,
  },
  tabBarLabel: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
