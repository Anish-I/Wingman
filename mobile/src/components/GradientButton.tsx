import React, { useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, fonts } from '../theme';

interface GradientButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'accent';
}

export default function GradientButton({ title, onPress, disabled, variant = 'primary' }: GradientButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const gradientColors = variant === 'primary'
    ? [colors.primaryLight, colors.primary] as const
    : [colors.accent, colors.accentDark] as const;
  const shadowColor = variant === 'primary' ? colors.primaryDark : colors.accentDark;

  function handlePressIn() {
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }

  function handlePressOut() {
    Animated.timing(scaleAnim, {
      toValue: 1.0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <View style={[styles.shadow, { backgroundColor: shadowColor }]} />
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        activeOpacity={0.8}
        style={[styles.touchable, disabled && styles.disabled]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <Text style={styles.text}>{title}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    marginVertical: 8,
  },
  shadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    height: 56,
    borderRadius: radius.xl,
  },
  touchable: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.6,
  },
  gradient: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.xl,
  },
  text: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
});
