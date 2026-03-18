import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Image, Animated, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, shadows, fonts } from '../../src/theme';

export default function OnboardingWelcome() {
  const router = useRouter();
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.7, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [glowAnim, fadeAnim, slideAnim]);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={styles.content}>
        <View style={styles.spacer} />

        <View style={styles.mascotContainer}>
          <Animated.View style={[styles.tealGlow, { opacity: glowAnim }]} />
          <View style={styles.mascotRing}>
            <Image
              source={require('../../assets/pip/pip-happy.png')}
              style={styles.mascotImage}
              resizeMode="contain"
            />
          </View>
        </View>

        <Text style={styles.title}>Hey, I'm Pip!</Text>
        <Text style={styles.subtitle}>Your AI-powered personal assistant</Text>

        <View style={styles.spacer} />
      </View>

      <View style={styles.footer}>
        <Pressable
          style={(state: any) => [
            styles.getStartedBtn,
            state.hovered && styles.getStartedHover,
            state.focused && styles.getStartedFocus,
            state.pressed && styles.getStartedPressed,
          ]}
          onPress={() => router.push('/onboarding/login')}
        >
          <Text style={styles.getStartedText}>Get Started</Text>
        </Pressable>
      </View>
      </Animated.View>
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
  mascotContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 160,
    height: 160,
    marginBottom: spacing.lg,
  },
  tealGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.accentGlow,
  },
  mascotRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.teal,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow(colors.teal),
  },
  mascotImage: {
    width: 120,
    height: 120,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontFamily: fonts.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  getStartedBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedHover: {
    opacity: 0.92,
  },
  getStartedFocus: {
    borderWidth: 2,
    borderColor: colors.teal,
  },
  getStartedPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  getStartedText: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.bold,
  },
});
