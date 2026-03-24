import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, purple, radii } from '@/components/ui/tokens';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import { popIn, entrance, gentleFloat, useReducedMotion, maybeReduce } from '@/lib/motion';

export default function WelcomeScreen() {
  const router = useRouter();
  const { surface, text: t } = useThemeColors();
  const reduced = useReducedMotion();

  React.useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Theme-dependent styles
  const themed = {
    safeArea: { flex: 1 as const, backgroundColor: surface.bg },
    entranceContainer: { width: '100%' as const, gap: 16 },
    welcomeCard: {
      backgroundColor: surface.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: surface.border,
      padding: 24,
      width: '100%' as const,
      marginTop: 24,
    },
    meetPipTitle: { color: t.primary },
    assistantSubtitle: { color: t.primary },
    description: { color: t.secondary },
    trustCard: {
      backgroundColor: surface.section,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: surface.border,
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: 12,
      padding: 14,
    },
    trustTitle: { color: t.primary },
    trustDescription: { color: t.secondary },
  };

  return (
    <SafeAreaView style={themed.safeArea}>
      <ProgressBar step={1} />
      <View className="flex-1 items-center justify-center px-6">
        {/* Pip avatar with floating animation */}
        <MotiView {...maybeReduce(popIn(0, 50), reduced)}>
          <MotiView {...maybeReduce(gentleFloat(300), reduced)}>
            <PipCard expression="wave" size="large" />
          </MotiView>
        </MotiView>

        {/* Welcome card with smooth entrance and micro-delay */}
        <MotiView {...maybeReduce(entrance(0, 250), reduced)} style={themed.entranceContainer}>
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

      <View className="px-6 pb-8">
        <GradientButton
          title="Nice to meet you!"
          showArrow
          onPress={() => router.push('/onboarding/features')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  meetPipTitle: {
    fontSize: 24,
    textAlign: 'center',
    fontFamily: 'Sora_700Bold',
    letterSpacing: -0.6,
    marginBottom: 12,
  },
  assistantSubtitle: {
    fontSize: 18,
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  trustTextContainer: {
    flex: 1,
  },
  trustTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 2,
  },
  trustDescription: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
});
