import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import * as React from 'react';
import { Platform, Pressable, Text } from 'react-native';
import { purple, radii, semantic, shadows } from '@/components/ui/tokens';
import { actionPressStyle, springs, webInteractive, webHoverStyle, webFocusRing, useReducedMotion, maybeReduce } from '@/lib/motion';

type GradientButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'success';
  icon?: string;
  showArrow?: boolean;
};

export default function GradientButton({
  title,
  onPress,
  disabled,
  variant = 'primary',
  icon,
  showArrow,
}: GradientButtonProps) {
  const isPrimary = variant === 'primary';
  const bgColor = isPrimary ? purple[500] : semantic.success;
  const glowColor = isPrimary ? purple[500] : semantic.success;
  const reduced = useReducedMotion();

  return (
    <MotiView
      className="w-full"
      {...maybeReduce({
        from: { opacity: 0, translateY: 12 },
        animate: { opacity: disabled ? 0.5 : 1, translateY: 0 },
        transition: { ...springs.snappy, delay: 80 },
      }, reduced)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!disabled }}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed, hovered, focused }: any) => [
          {
            height: 56,
            borderRadius: radii.md,
            backgroundColor: bgColor,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
          },
          !disabled && isPrimary ? shadows.purpleGlow : undefined,
          ...actionPressStyle({ pressed }),
          disabled ? { opacity: 0.4, backgroundColor: isPrimary ? purple[700] : '#1B6B2A' } : undefined,
          webInteractive(disabled),
          // Web hover: amplify glow with smooth transition
          Platform.OS === 'web' && hovered && !pressed && !disabled
            ? webHoverStyle(true, glowColor, 'strong')
            : undefined,
          // Web focus ring (keyboard navigation)
          Platform.OS === 'web' && focused && !disabled
            ? webFocusRing(true, glowColor)
            : undefined,
        ]}
      >
        {icon
          ? (
              <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color="#FFFFFF" />
            )
          : null}
        <Text
          style={{
            color: '#FFFFFF',
            fontFamily: 'Inter_600SemiBold',
            fontSize: 16,
            letterSpacing: -0.2,
          }}
        >
          {title}
        </Text>
        {showArrow
          ? (
              <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.7)" style={{ marginLeft: 2 }} />
            )
          : null}
      </Pressable>
    </MotiView>
  );
}
