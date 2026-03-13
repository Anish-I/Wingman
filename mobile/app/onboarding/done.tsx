import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius } from '../../src/theme';

const CONFETTI_PIECES = [
  { color: colors.primaryLight, size: 8, top: '8%', left: '10%', shape: 'circle' },
  { color: colors.accent, size: 6, top: '12%', left: '85%', shape: 'square' },
  { color: colors.purple, size: 10, top: '5%', left: '50%', shape: 'circle' },
  { color: colors.orange, size: 7, top: '18%', left: '25%', shape: 'square' },
  { color: colors.success, size: 5, top: '15%', left: '70%', shape: 'circle' },
  { color: colors.primaryLight, size: 6, top: '22%', left: '90%', shape: 'circle' },
  { color: colors.accent, size: 9, top: '3%', left: '35%', shape: 'square' },
  { color: colors.purple, size: 5, top: '20%', left: '60%', shape: 'circle' },
  { color: colors.orange, size: 8, top: '10%', left: '5%', shape: 'square' },
  { color: colors.success, size: 6, top: '7%', left: '75%', shape: 'circle' },
  { color: colors.primaryLight, size: 7, top: '25%', left: '45%', shape: 'square' },
  { color: colors.accent, size: 5, top: '2%', left: '20%', shape: 'circle' },
];

const CONNECTED_APPS = [
  { name: 'Gmail', color: colors.primaryLight },
  { name: 'Calendar', color: colors.accent },
  { name: 'Slack', color: colors.purple },
];

export default function DoneScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      {/* Confetti */}
      {CONFETTI_PIECES.map((piece, i) => (
        <View
          key={i}
          style={[
            styles.confetti,
            {
              backgroundColor: piece.color,
              width: piece.size,
              height: piece.size,
              borderRadius: piece.shape === 'circle' ? piece.size / 2 : 2,
              top: piece.top as any,
              left: piece.left as any,
            },
          ]}
        />
      ))}

      <ProgressBar step={7} />
      <View style={styles.content}>
        <View style={styles.spacer} />
        <PipCard
          expression="clap"
          message="You are all set! Just text me anytime. Welcome to the flock!"
        />

        {/* Connected app pills */}
        <View style={styles.pillRow}>
          {CONNECTED_APPS.map((app) => (
            <View key={app.name} style={styles.pill}>
              <View style={[styles.pillDot, { backgroundColor: app.color }]} />
              <Text style={styles.pillText}>{app.name}</Text>
              <Ionicons name="checkmark" size={14} color={colors.textSecondary} />
            </View>
          ))}
        </View>

        <View style={styles.spacer} />
      </View>
      <View style={styles.footer}>
        <GradientButton
          title="Start Texting Pip"
          onPress={() => router.replace('/(tabs)/chat')}
          gradientColors={['#34C759', '#2DB84D']}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.lg, alignItems: 'center' },
  spacer: { flex: 1 },
  confetti: {
    position: 'absolute',
    opacity: 0.6,
    zIndex: 0,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: spacing.sm,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pillText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
