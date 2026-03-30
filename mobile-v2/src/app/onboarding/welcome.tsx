import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, layout, purple, radii, spacing } from '@/components/ui/tokens';
import { fontScale } from '@/lib/responsive';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import { popIn, entrance, gentleFloat, delays, useReducedMotion, maybeReduce } from '@/lib/motion';
import { completeOnboardingStep } from '@/lib/onboarding-steps';

export default function WelcomeScreen() {
  const router = useRouter();
  const { surface, text: t } = useThemeColors();
  const reduced = useReducedMotion();

  React.useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    safeArea: [styles.safeAreaFlex, { backgroundColor: surface.bg }],
    entranceContainer: styles.entranceContainer,
    welcomeCard: [styles.welcomeCard, { backgroundColor: surface.card, borderColor: surface.border }],
    meetPipTitle: { color: t.primary },
    assistantSubtitle: { color: t.primary },
    description: { color: t.secondary },
    trustCard: [styles.trustCard, { backgroundColor: surface.section, borderColor: surface.border }],
    trustTitle: { color: t.primary },
    trustDescription: { color: t.secondary },
  };

  return (
    <SafeAreaView style={themed.safeArea}>
      <ProgressBar step={1} />
      <View className="flex-1 items-center justify-center" style={{ paddingHorizontal: layout.screenPaddingH }}>
        {/* Pip avatar with floating animation */}
        <MotiView {...maybeReduce(popIn(0, delays.fast), reduced)}>
          <MotiView {...maybeReduce(gentleFloat(delays.sequence), reduced)}>
            <PipCard expression="wave" size="large" />
          </MotiView>
        </MotiView>

        {/* Welcome card with smooth entrance and micro-delay */}
        <MotiView {...maybeReduce(entrance(0, delays.slow), reduced)} style={themed.entranceContainer}>
          <View style={themed.welcomeCard}>
            <Text style={[styles.meetPipTitle, themed.meetPipTitle]}>
              {'Meet Pip'}
            </Text>
            <Text style={[styles.assistantSubtitle, themed.assistantSubtitle]}>
              Your personal AI assistant
            </Text>
            <Text style={[styles.description, themed.description]}>
              Automate your life through SMS — manage calendars, tasks, music, and more. Just text Pip.
            </Text>
          </View>

          {/* Trust cue card */}
          <View style={themed.trustCard}>
            <Ionicons name="shield-checkmark-outline" size={18} color={purple[500]} />
            <View style={styles.trustTextContainer}>
              <Text style={[styles.trustTitle, themed.trustTitle]}>
                Privacy-first
              </Text>
              <Text style={[styles.trustDescription, themed.trustDescription]}>
                Your data stays encrypted. We never sell or misuse your information.
              </Text>
            </View>
          </View>
        </MotiView>
      </View>

      <View style={{ paddingHorizontal: layout.screenPaddingH, paddingBottom: layout.screenPaddingBottom }}>
        <GradientButton
          title="Nice to meet you!"
          showArrow
          onPress={() => { completeOnboardingStep('welcome'); router.push('/onboarding/features'); }}
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
  entranceContainer: {
    width: '100%',
    gap: layout.sectionGap,
  },
  welcomeCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing['2xl'],
    width: '100%',
    marginTop: spacing['2xl'],
  },
  trustCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  // --- Original static styles ---
  meetPipTitle: {
    fontSize: fontScale(24),
    textAlign: 'center',
    fontFamily: 'Sora_700Bold',
    letterSpacing: -0.6,
    marginBottom: spacing.md,
  },
  assistantSubtitle: {
    fontSize: fontScale(18),
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontScale(14),
    textAlign: 'center',
    marginTop: spacing.xs,
    fontFamily: 'Inter_400Regular',
    lineHeight: fontScale(21),
  },
  trustTextContainer: {
    flex: 1,
  },
  trustTitle: {
    fontSize: fontScale(13),
    fontFamily: 'Inter_600SemiBold',
    marginBottom: spacing.xxs,
  },
  trustDescription: {
    fontSize: fontScale(12),
    fontFamily: 'Inter_400Regular',
    lineHeight: fontScale(18),
  },
});
