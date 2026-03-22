import { Ionicons } from '@expo/vector-icons';
import { Redirect, SplashScreen, Tabs } from 'expo-router';
import * as React from 'react';
import { useCallback, useEffect } from 'react';
import { purple, useThemeColors } from '@/components/ui/tokens';
import { useAuthStore as useAuth } from '@/features/auth/use-auth-store';
import { useIsFirstTime } from '@/lib/hooks/use-is-first-time';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Ionicons name={name} color={color} size={22} />;
}

export default function TabLayout() {
  const { surface, text: t } = useThemeColors();
  const status = useAuth.use.status();
  const token = useAuth.use.token();
  const [isFirstTime] = useIsFirstTime();
  const hideSplash = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (status !== 'idle') {
      const timer = setTimeout(() => {
        hideSplash();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hideSplash, status]);

  if (status === 'idle') {
    return null; // Don't render anything until auth state is determined
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
        tabBarStyle: {
          backgroundColor: surface.bg,
          borderTopColor: surface.border,
          borderTopWidth: 1,
          height: 72,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: purple[500],
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
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
