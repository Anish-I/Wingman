import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing } from '../../src/theme';

export default function DoneScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={7} />
      <View style={styles.content}>
        <View style={styles.spacer} />
        <PipCard
          expression="clap"
          message={"You're all set!\nI'm ready when you are.\nJust text me anything."}
        />
        <Text style={styles.subtitle}>
          Tip: Text me things like "send an email" or "check my calendar" and I'll handle it.
        </Text>
        <View style={styles.spacer} />
      </View>
      <View style={styles.footer}>
        <GradientButton
          title="Start Chatting"
          onPress={() => router.replace('/(tabs)/chat')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.lg, alignItems: 'center' },
  spacer: { flex: 1 },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
