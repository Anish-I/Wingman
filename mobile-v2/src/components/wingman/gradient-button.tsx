import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'success';
  icon?: string;
  showArrow?: boolean;
}

export default function GradientButton({
  title,
  onPress,
  disabled,
  variant = 'primary',
  icon,
  showArrow,
}: GradientButtonProps) {
  const isPrimary = variant === 'primary';
  const bgColor = isPrimary ? '#FF3B30' : '#32D74B';

  return (
    <MotiView className="w-full">
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
        style={[
          {
            height: 56,
            borderRadius: 12,
            backgroundColor: bgColor,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
          },
          disabled ? { opacity: 0.5 } : undefined,
        ]}
      >
        {icon ? (
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={20} color="#FFFFFF" />
        ) : null}
        <Text
          style={
            isPrimary
              ? { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 16 }
              : { color: '#FFFFFF', fontFamily: 'Sora_700Bold', fontSize: 17 }
          }
        >
          {title}
        </Text>
        {showArrow ? (
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 4 }} />
        ) : null}
      </TouchableOpacity>
    </MotiView>
  );
}
