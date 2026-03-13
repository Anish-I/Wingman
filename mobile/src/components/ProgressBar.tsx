import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '../theme';

interface ProgressBarProps {
  step: number;
  total?: number;
}

export default function ProgressBar({ step, total = 7 }: ProgressBarProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            i < step ? styles.active : styles.inactive,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.full,
  },
  active: {
    backgroundColor: colors.accent,
  },
  inactive: {
    backgroundColor: colors.border,
  },
});
