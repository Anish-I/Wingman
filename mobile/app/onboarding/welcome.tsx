import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius, shadows } from '../../src/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={1} />
      <View style={styles.content}>
        <View style={styles.spacer} />
        <PipCard expression="wave" size="large" />
        <View style={styles.speechBubble}>
          <Text style={styles.speechTitle}>
            Hey! I am Pip, your personal AI pigeon!
          </Text>
          <Text style={styles.speechBody}>
            I automate your life through SMS. Calendars, tasks, music — just text me.
          </Text>
        </View>
        <View style={styles.spacer} />
      </View>
      <View style={styles.footer}>
        <GradientButton
          title="Nice to meet you!"
          onPress={() => router.push('/onboarding/features')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  spacer: { flex: 1 },
  speechBubble: {
    backgroundColor: colors.glass,
    borderRadius: 20,
    padding: 20,
    marginTop: spacing.md,
    marginHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.md,
  },
  speechTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  speechBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    opacity: 0.8,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
