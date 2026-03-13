import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'success';
}

export default function GradientButton({ title, onPress, disabled, variant = 'primary' }: GradientButtonProps) {
  const gradientColors = variant === 'success'
    ? ['#34C759', '#2DB84D'] as const
    : ['#3B5998', '#4A7BD9'] as const;

  return (
    <MotiView className="w-full shadow-md">
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
        className="rounded-[28px] overflow-hidden"
        style={disabled ? { opacity: 0.5 } : undefined}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.5 }}
          style={{ height: 56, justifyContent: 'center', alignItems: 'center', borderRadius: 28 }}
        >
          <Text className="text-white text-base font-bold tracking-wide">{title}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </MotiView>
  );
}
