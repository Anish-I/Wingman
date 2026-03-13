import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing } from '../../src/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={1} />
      <View style={styles.content}>
        <View style={styles.spacer} />
        <PipCard
          expression="wave"
          message={"Hey there! I'm Pip \u2014 your personal AI assistant. I'll help you automate your whole life."}
        />
        <View style={styles.spacer} />
      </View>
      <View style={styles.footer}>
        <GradientButton
          title="Get Started"
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
  },
  spacer: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
