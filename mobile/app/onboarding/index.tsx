import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Image, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius, shadows } from '../../src/theme';

export default function WelcomeScreen() {
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

        <Text style={styles.title}>Hey, I am Pip!</Text>
        <Text style={styles.subtitle}>
          Your AI-powered life assistant.{'\n'}I automate your world through simple texts.
        </Text>

        <View style={styles.spacer} />
      </View>

      <View style={styles.footer}>
        <GradientButton
          title="Get Started"
          onPress={() => router.push('/onboarding/login')}
        />
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
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
