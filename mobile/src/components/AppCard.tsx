import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../theme';

interface AppCardProps {
  name: string;
  emoji: string;
  connected?: boolean;
  onPress?: () => void;
}

export default function AppCard({ name, emoji, connected, onPress }: AppCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, connected && styles.connected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.name}>{name}</Text>
      {connected && (
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    minWidth: 90,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connected: {
    borderColor: colors.success,
  },
  emoji: {
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  name: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
});
