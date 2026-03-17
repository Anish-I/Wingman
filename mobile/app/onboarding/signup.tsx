import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, spacing, radius, shadows, gradients } from '../../src/theme';
import { api } from '../../src/api';
import { saveToken } from '../../src/auth';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

const redirectUri = AuthSession.makeRedirectUri({ preferLocalhost: true });

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [loading, setLoading] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();

    // Pulsing glow on mascot
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.6, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [fadeAnim, slideAnim, glowAnim]);

  // Google Auth via expo-auth-session
  const [googleRequest, googleResponse, googlePromptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE: false,
    },
    { authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth' },
  );

  React.useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        handleSocialLogin('google', idToken);
      }
    }
  }, [googleResponse]);

  async function handleSocialLogin(provider: 'google' | 'apple', token: string, userName?: string) {
    setLoading(true);
    try {
      const result = await api.auth.social(provider, token, userName);
      await saveToken(result.token);
      router.replace('/onboarding/connect');
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert('Not configured', 'Google sign-in is not available yet.');
      return;
    }
    try {
      await googlePromptAsync();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Google sign-in failed.');
    }
  }

  async function handleAppleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        const appleName = credential.fullName
          ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ')
          : undefined;
        await handleSocialLogin('apple', credential.identityToken, appleName || undefined);
      }
    } catch (err: any) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Error', err?.message || 'Apple sign-in failed.');
      }
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Hero Mascot */}
          <Animated.View style={[styles.heroContainer, { opacity: fadeAnim }]}>
            <View style={styles.purpleGlow} />
            <Animated.View style={[styles.glowRing, { opacity: glowAnim }]} />
            <View style={styles.mascotRing}>
              <Image
                source={require('../../assets/pip/pip-happy.png')}
                style={styles.mascotImage}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          {/* Headlines */}
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <Text style={styles.headline}>Welcome to Wingman</Text>
            <Text style={styles.subtitle}>Your AI-powered life assistant</Text>
          </Animated.View>

          {/* SSO Buttons */}
          <Animated.View style={[styles.ssoContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Google Button */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
              <Text style={styles.googleText}>Continue with Google</Text>
            </TouchableOpacity>

            {/* Apple Button — iOS only */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleAppleSignIn}
                disabled={loading}
                activeOpacity={0.85}
              >
                <Text style={styles.appleIcon}>{'\uF8FF'}</Text>
                <Text style={styles.appleText}>Continue with Apple</Text>
              </TouchableOpacity>
            )}

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with phone</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Phone CTA */}
            <TouchableOpacity
              style={styles.phoneButton}
              onPress={() => {
                const trimmed = name.trim();
                if (trimmed.length >= 2) {
                  router.push({ pathname: '/onboarding/phone', params: { name: trimmed } });
                } else {
                  router.push('/onboarding/phone');
                }
              }}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.phoneIcon}>📱</Text>
              <Text style={styles.phoneText}>Continue with Phone Number</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Sign In Link */}
          <View style={styles.signinRow}>
            <Text style={styles.signinMuted}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/onboarding/phone')}>
              <Text style={styles.signinLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },

  // Hero mascot
  heroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    width: 160,
    height: 160,
  },
  glowRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.accentGlow,
  },
  purpleGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
  },
  mascotRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.accent,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow(colors.accent),
  },
  mascotImage: { width: 120, height: 120 },

  // Headlines
  headline: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },

  // SSO container
  ssoContainer: {
    width: '100%',
    backgroundColor: colors.glass,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing.md,
  },

  // Google button
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    height: 56,
    marginBottom: 12,
    paddingHorizontal: spacing.md,
    ...shadows.md,
  },
  googleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f1f1f',
  },

  // Apple button
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: radius.lg,
    height: 56,
    marginBottom: 12,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#222',
    ...shadows.md,
  },
  appleIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    marginRight: 12,
  },
  appleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 13,
    marginHorizontal: 14,
    textTransform: 'lowercase',
  },

  // Phone button
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: radius.lg,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  phoneIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  phoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },

  // Sign in link
  signinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  signinMuted: {
    color: colors.textMuted,
    fontSize: 14,
  },
  signinLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },

  // Loading overlay
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
