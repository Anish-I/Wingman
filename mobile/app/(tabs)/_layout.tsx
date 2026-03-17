import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, color, size }: { name: IconName; color: string; size: number }) {
  return <Ionicons name={name} color={color} size={size - 2} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#8888aa',
        tabBarLabelStyle: {
          fontSize: 11,
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
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="chatbubble-ellipses" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="apps"
        options={{
          title: 'Apps',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="grid" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="workflows"
        options={{
          title: 'Workflows',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="flash" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <TabIcon name="settings-sharp" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
