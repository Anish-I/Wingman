import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import * as React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, blue, semantic, teal } from '@/components/ui/tokens';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import SectionLabel from '@/components/wingman/section-label';
import { entrance, useReducedMotion, maybeReduce } from '@/lib/motion';

const FEATURES = [
  { icon: 'calendar-outline' as const, title: 'Schedule meetings', accent: blue[400] },
  { icon: 'checkmark-circle-outline' as const, title: 'Manage tasks', accent: semantic.success },
  { icon: 'musical-notes-outline' as const, title: 'Control music', accent: purple[400] },
  { icon: 'mail-outline' as const, title: 'Send emails', accent: teal[300] },
  { icon: 'bulb-outline' as const, title: 'Smart reminders', accent: '#F5A623' },
];

export default function FeaturesScreen() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { surface, text: t } = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: surface.bg }}>
      <ProgressBar step={2} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24 }}>
        <PipCard expression="thumbsup" size="tiny" />

        <View className="mt-4">
          <SectionLabel text="WHAT I CAN DO" />
        </View>

        <Text
          style={{
            color: t.primary,
            fontSize: 30,
            fontFamily: 'Sora_700Bold',
            letterSpacing: -1.5,
            marginTop: 12,
          }}
        >
          Automate Everything
        </Text>
        <Text
          style={{
            color: t.secondary,
            fontSize: 18,
            fontFamily: 'Sora_700Bold',
            marginBottom: 20,
          }}
        >
          through SMS.
        </Text>

        <View style={{ gap: 11 }}>
          {FEATURES.map((feat, i) => (
            <MotiView
              key={i}
              {...maybeReduce(entrance(i, 180), reducedMotion)}
            >
              <View
                accessible
                accessibilityLabel={feat.title}
                style={{
                  height: 56,
                  borderRadius: 14,
                  backgroundColor: i % 2 === 0 ? surface.card : surface.cardAlt,
                  borderWidth: 1,
                  borderColor: surface.border,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: `${feat.accent}20`,
                    borderWidth: 1,
                    borderColor: `${feat.accent}30`,
                  }}
                >
                  <Ionicons name={feat.icon} size={20} color={feat.accent} />
                </View>
                <Text
                  style={{
                    color: t.primary,
                    fontSize: 15,
                    fontFamily: 'Inter_600SemiBold',
                    flex: 1,
                  }}
                >
                  {feat.title}
                </Text>
              </View>
            </MotiView>
          ))}
        </View>
      </ScrollView>

      <View className="px-6 pb-8">
        <GradientButton
          title="Let's Go"
          onPress={() => router.push('/onboarding/signup')}
        />
      </View>
    </SafeAreaView>
  );
}
