import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import { colors, spacing, radius, shadows } from '../../src/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={1} />
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.spacer} />
        <PipCard expression="wave" size="large" />
        <View style={styles.speechBubble}>
          <Text style={styles.speechTitle}>
            Hey! I am Pip, your personal AI pigeon!
          </Text>
          <Text style={styles.speechBody}>
            I automate your life through SMS. Calendars, tasks, music — just text me.
          </Text>
        </View>
        <View style={styles.spacer} />
      </Animated.View>
      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/onboarding/features')}
          style={(state: any) => [
            styles.ctaButton,
            state.hovered && styles.ctaHover,
            state.focused && styles.ctaFocus,
            state.pressed && styles.ctaPressed,
          ]}
        >
          <Text style={styles.ctaText}>Nice to meet you!</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  spacer: { flex: 1 },
  speechBubble: {
    backgroundColor: colors.glass,
    borderRadius: 20,
    padding: 20,
    marginTop: spacing.md,
    marginHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.md,
  },
  speechTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  speechBody: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    opacity: 0.8,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  ctaHover: {
    opacity: 0.92,
  },
  ctaPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  ctaFocus: {
    borderWidth: 2,
    borderColor: colors.teal,
  },
});
