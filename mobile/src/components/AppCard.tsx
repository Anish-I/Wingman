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
      <View style={styles.emojiContainer}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      {connected && (
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={8} color="#FFFFFF" />
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    minWidth: 90,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connected: {
    borderColor: colors.success,
  },
  emojiContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emoji: {
    fontSize: 28,
  },
  name: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
