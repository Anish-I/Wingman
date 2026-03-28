import { Ionicons } from '@expo/vector-icons';
import { Redirect, SplashScreen, Tabs, useRouter } from 'expo-router';
import * as React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { purple, spacing, useThemeColors } from '@/components/ui/tokens';
import { useAuthStore as useAuth } from '@/features/auth/use-auth-store';
import { useChatStore } from '@/features/chat/store';
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
  const [isFirstTime, setIsFirstTime] = useIsFirstTime();
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

  const router = useRouter();
  // Track whether the component has mounted past the initial render so we
  // can distinguish "already showing tabs, then signed out" from the first
  // render where <Redirect> is sufficient.
  const mountedRef = useRef(false);

  // Clear chat messages on sign-out so a subsequent sign-in (potentially a
  // different user) doesn't see stale messages from the previous session.
  useEffect(() => {
    if (status === 'signOut') {
      useChatStore.getState().clearMessages();
    }
  }, [status]);

  // Imperatively redirect to /login when auth state changes after mount.
  // The declarative <Redirect> only fires reliably on the initial render;
  // once <Tabs> is mounted, swapping it out for <Redirect> may not navigate.
  useEffect(() => {
    if (mountedRef.current && hydrated && (status === 'signOut' || !token)) {
      router.replace('/login');
    }
  }, [hydrated, status, token, router]);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

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
    // User has a valid token (login/signup guard above already handled the
    // no-token case) but isFirstTime was never cleared — e.g. the app crashed
    // after signup but before the done screen.  Clear the stale flag instead
    // of looping back to onboarding; the token proves signup completed.
    setIsFirstTime(false);
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
