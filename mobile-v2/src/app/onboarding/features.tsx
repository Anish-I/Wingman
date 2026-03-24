import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import * as React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, blue, purple, radii, semantic, spacing, teal } from '@/components/ui/tokens';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import SectionLabel from '@/components/wingman/section-label';
import { entrance, delays, useReducedMotion, maybeReduce } from '@/lib/motion';

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

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    safeArea: [styles.safeAreaFlex, { backgroundColor: surface.bg }],
    mainTitle: { color: t.primary },
    subTitle: { color: t.secondary },
    featureCard: (i: number) => [
      styles.featureCard,
      {
        backgroundColor: i % 2 === 0 ? surface.card : surface.cardAlt,
        borderColor: surface.border,
      },
    ],
    featureTitle: { color: t.primary },
  };

  return (
    <SafeAreaView style={themed.safeArea}>
      <ProgressBar step={2} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <PipCard expression="thumbsup" size="tiny" />

        <View className="mt-4">
          <SectionLabel text="WHAT I CAN DO" />
        </View>

        <Text style={[styles.mainTitle, themed.mainTitle]}>
          Automate Everything
        </Text>
        <Text style={[styles.subTitle, themed.subTitle]}>
          through SMS.
        </Text>

        <View style={styles.featureList}>
          {FEATURES.map((feat, i) => (
            <MotiView
              key={i}
              {...maybeReduce(entrance(i, delays.normal), reducedMotion)}
            >
              <View
                accessible
                accessibilityLabel={feat.title}
                style={themed.featureCard(i)}
              >
                <View
                  style={[
                    styles.featureIconCircle,
                    {
                      backgroundColor: `${feat.accent}20`,
                      borderWidth: 1,
                      borderColor: `${feat.accent}30`,
                    },
                  ]}
                >
                  <Ionicons name={feat.icon} size={20} color={feat.accent} />
                </View>
                <Text style={[styles.featureTitle, themed.featureTitle]}>
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

const styles = StyleSheet.create({
  // --- Extracted from themed object ---
  safeAreaFlex: {
    flex: 1,
  },
  featureCard: {
    height: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // --- Original static styles ---
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  mainTitle: {
    fontSize: 30,
    fontFamily: 'Sora_700Bold',
    letterSpacing: -1.5,
    marginTop: 12,
  },
  subTitle: {
    fontSize: 18,
    fontFamily: 'Sora_700Bold',
    marginBottom: spacing.xl,
  },
  featureList: {
    gap: spacing.md,
  },
  featureIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
});
