import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { radii, semantic, teal, useThemeColors } from '@/components/ui/tokens';
import { chipPressStyle, webInteractive } from '@/lib/motion';

type AppCardProps = {
  emoji: string;
  name: string;
  connected: boolean;
  onPress: () => void;
  color?: string;
};

export default function AppCard({ emoji, name, connected, onPress, color }: AppCardProps) {
  const { surface, text: t } = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${connected ? 'connected' : 'not connected'}`}
      accessibilityHint={connected ? 'Double tap to manage connection' : 'Double tap to connect this app'}
      style={({ pressed, hovered }) => [
        {
          width: 88,
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
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: semantic.success,
            borderWidth: 1.5,
            borderColor: surface.bg,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            shadowColor: semantic.success,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          <Ionicons name="checkmark" size={11} color="#FFFFFF" />
        </View>
      )}
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
          backgroundColor: color ? `${color}18` : surface.section,
          borderWidth: 1,
          borderColor: color ? `${color}24` : surface.border,
        }}
      >
        <Text style={{ fontSize: 28 }}>{emoji}</Text>
      </View>
      <Text
        className="text-center text-xs font-medium text-foreground"
        numberOfLines={2}
        style={{
          fontSize: 12,
          fontFamily: 'Inter_500Medium',
          color: connected ? t.primary : t.secondary,
        }}
      >
        {name}
      </Text>
    </Pressable>
  );
}
