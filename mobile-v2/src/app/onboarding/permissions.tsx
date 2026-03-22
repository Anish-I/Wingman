import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import * as React from 'react';
import { useState, useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, purple, semantic, teal } from '@/components/ui/tokens';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import SectionLabel from '@/components/wingman/section-label';
import { entrance, chipPressStyle, springs, webInteractive, useReducedMotion, maybeReduce } from '@/lib/motion';

type PermissionItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  accent: string;
  type: 'notifications' | 'coming-soon';
};

const PERMISSIONS: PermissionItem[] = [
  {
    icon: 'notifications-outline',
    title: 'Notifications',
    subtitle: 'Get instant task updates',
    accent: purple[500],
    type: 'notifications',
  },
  {
    icon: 'people-outline',
    title: 'Contacts',
    subtitle: 'Coming soon',
    accent: purple[400],
    type: 'coming-soon',
  },
  {
    icon: 'calendar-outline',
    title: 'Calendar',
    subtitle: 'Coming soon',
    accent: teal[300],
    type: 'coming-soon',
  },
  {
    icon: 'location-outline',
    title: 'Location',
    subtitle: 'Coming soon',
    accent: teal[400],
    type: 'coming-soon',
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { surface, text: t } = useThemeColors();
  const reduced = useReducedMotion();
  const [notificationsGranted, setNotificationsGranted] = useState(false);

  // Check existing notification permission on mount
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        setNotificationsGranted(true);
      }
    });
  }, []);

  async function handleAllowNotifications() {
    if (Platform.OS === 'web') {
      setNotificationsGranted(true);
      return;
    }
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsGranted(status === 'granted');
    } catch {
      // Permission request failed — leave as not granted
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: surface.bg }}>
      <ProgressBar step={4} />
      <View className="flex-1 px-6">
        {/* Pip speech bubble row */}
        <View className="mt-4 flex-row items-center gap-3">
          <PipCard expression="question" size="mini" />
          <View
            style={{
              flex: 1,
              backgroundColor: surface.cardAlt,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: surface.border,
              paddingVertical: 10,
              paddingHorizontal: 14,
            }}
          >
            <Text
              style={{
                color: t.primary,
                fontSize: 13,
                fontFamily: 'Inter_500Medium',
              }}
            >
              I need a few permissions to help you out!
            </Text>
          </View>
        </View>

        <View className="mt-5">
          <SectionLabel text="PERMISSIONS" />
        </View>

        {/* Permission cards */}
        <View style={{ gap: 10, marginTop: 16 }}>
          {PERMISSIONS.map((perm, i) => {
            const isGranted = perm.type === 'notifications' && notificationsGranted;
            const isComingSoon = perm.type === 'coming-soon';

            return (
              <MotiView
                key={i}
                {...maybeReduce(entrance(i, 100), reduced)}
              >
                <View
                  style={{
                    borderRadius: 14,
                    backgroundColor: surface.card,
                    borderWidth: 1,
                    borderColor: isGranted ? 'rgba(50, 215, 75, 0.2)' : surface.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    opacity: isComingSoon ? 0.5 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: `${perm.accent}14`,
                    }}
                  >
                    <Ionicons name={perm.icon} size={20} color={perm.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: t.primary,
                        fontSize: 14,
                        fontFamily: 'Inter_600SemiBold',
                      }}
                    >
                      {perm.title}
                    </Text>
                    <Text
                      style={{
                        color: t.secondary,
                        fontSize: 12,
                        fontFamily: 'Inter_400Regular',
                      }}
                    >
                      {perm.subtitle}
                    </Text>
                  </View>
                  {isComingSoon ? (
                    <View
                      style={{
                        backgroundColor: surface.cardAlt,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: t.muted,
                          fontSize: 10,
                          fontFamily: 'Inter_500Medium',
                        }}
                      >
                        Soon
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleAllowNotifications}
                      disabled={isGranted}
                      style={({ pressed }) => [
                        ...chipPressStyle({ pressed }),
                        webInteractive(),
                      ]}
                    >
                      {isGranted
                        ? (
                            <MotiView
                              {...maybeReduce({
                                from: { scale: 0.6 },
                                animate: { scale: 1 },
                                transition: springs.bouncy,
                              }, reduced)}
                              style={{
                                backgroundColor: semantic.success,
                                borderRadius: 8,
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                              }}
                            >
                              <Text
                                style={{
                                  color: '#FFFFFF',
                                  fontSize: 11,
                                  fontFamily: 'Inter_600SemiBold',
                                }}
                              >
                                Done
                              </Text>
                            </MotiView>
                          )
                        : (
                            <View
                              style={{
                                backgroundColor: purple[500],
                                borderRadius: 8,
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                              }}
                            >
                              <Text
                                style={{
                                  color: '#FFFFFF',
                                  fontSize: 11,
                                  fontFamily: 'Inter_600SemiBold',
                                }}
                              >
                                Allow
                              </Text>
                            </View>
                          )}
                    </Pressable>
                  )}
                </View>
              </MotiView>
            );
          })}
        </View>
      </View>

      <View className="px-6 pb-8">
        <GradientButton
          title="Continue"
          onPress={() => router.push('/onboarding/phone')}
        />
      </View>
    </SafeAreaView>
  );
}
