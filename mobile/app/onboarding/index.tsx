import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Image, Animated, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, spacing, shadows } from '../../src/theme';

export default function OnboardingWelcome() {
  const router = useRouter();
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.7, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [glowAnim]);

  return (
    <SafeAreaView style={styles.container}>
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
        <TouchableOpacity
          style={styles.getStartedBtn}
          onPress={() => router.push('/onboarding/login')}
          activeOpacity={0.85}
        >
          <Text style={styles.getStartedText}>Get Started</Text>
        </TouchableOpacity>
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
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: '#8888aa',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  getStartedBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
