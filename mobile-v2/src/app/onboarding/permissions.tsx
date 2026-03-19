import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import * as React from 'react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { purple, semantic, surface, text as t, teal } from '@/components/ui/tokens';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import SectionLabel from '@/components/wingman/section-label';
import { entrance, chipPressStyle, springs, webInteractive } from '@/lib/motion';

const PERMISSIONS = [
  {
    icon: 'notifications-outline' as const,
    title: 'Notifications',
    subtitle: 'Get instant task updates',
    accent: purple[500],
  },
  {
    icon: 'people-outline' as const,
    title: 'Contacts',
    subtitle: 'Send messages to friends',
    accent: purple[400],
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Calendar',
    subtitle: 'Schedule and manage events',
    accent: teal[300],
  },
  {
    icon: 'location-outline' as const,
    title: 'Location',
    subtitle: 'Find nearby places & navigate',
    accent: teal[400],
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const [granted, setGranted] = useState<Record<number, boolean>>({});

  function handleAllow(index: number) {
    setGranted(prev => ({ ...prev, [index]: true }));
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
          {PERMISSIONS.map((perm, i) => (
            <MotiView
              key={i}
              {...entrance(i, 100)}
            >
              <View
                style={{
                  borderRadius: 14,
                  backgroundColor: surface.card,
                  borderWidth: 1,
                  borderColor: granted[i] ? 'rgba(50, 215, 75, 0.2)' : surface.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
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
                <Pressable
                  onPress={() => handleAllow(i)}
                  style={({ pressed }) => [
                    ...chipPressStyle({ pressed }),
                    webInteractive(),
                  ]}
                >
                  {granted[i]
                    ? (
                        <MotiView
                          from={{ scale: 0.6 }}
                          animate={{ scale: 1 }}
                          transition={springs.bouncy}
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
              </View>
            </MotiView>
          ))}
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
