import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { base, radii, semantic, teal, useThemeColors } from '@/components/ui/tokens';
import { chipPressStyle, webInteractive } from '@/lib/motion';
import { useResponsive } from '@/lib/responsive';

type AppCardProps = {
  emoji: string;
  name: string;
  connected: boolean;
  onPress: () => void;
  color?: string;
};

export default function AppCard({ emoji, name, connected, onPress, color }: AppCardProps) {
  const { surface, text: t } = useThemeColors();
  const { standaloneCardWidth, standaloneIconSize } = useResponsive();

  const badgeStyle = {
    ...styles.badge,
    backgroundColor: semantic.success,
    borderColor: surface.bg,
    shadowColor: semantic.success,
  };

  const iconContainerStyle = {
    ...styles.iconContainer,
    width: standaloneIconSize,
    height: standaloneIconSize,
    borderRadius: standaloneIconSize / 2,
    backgroundColor: color ? `${color}18` : surface.section,
    borderColor: color ? `${color}24` : surface.border,
  };

  const nameStyle = {
    ...styles.name,
    color: connected ? t.primary : t.secondary,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${connected ? 'connected' : 'not connected'}`}
      accessibilityHint={connected ? 'Double tap to manage connection' : 'Double tap to connect this app'}
      style={({ pressed, hovered }) => [
        {
          width: standaloneCardWidth,
          backgroundColor: connected ? surface.card : surface.cardAlt,
          borderRadius: radii.lg,
          borderWidth: 1.5,
          borderColor: connected ? teal[300] : surface.border,
          padding: 12,
          alignItems: 'center',
          // Connected state glow
          ...(connected
            ? {
              shadowColor: teal[300],
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 2,
            }
            : {}),
        },
        ...chipPressStyle({ pressed }),
        webInteractive(),
        // Hover state on web
        hovered && !pressed ? { opacity: 0.95 } : undefined,
      ]}
      onPress={onPress}
    >
      {connected && (
        <View style={badgeStyle}>
          <Ionicons name="checkmark" size={11} color={base.white} />
        </View>
      )}
      <View style={iconContainerStyle}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text
        className="text-center text-xs font-medium text-foreground"
        numberOfLines={2}
        style={nameStyle}
      >
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 28,
  },
  name: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
