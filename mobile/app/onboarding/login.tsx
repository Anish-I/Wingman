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
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadows, fonts } from '../../src/theme';
import { api } from '../../src/api';
import { saveToken } from '../../src/auth';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const redirectUri = AuthSession.makeRedirectUri({ preferLocalhost: true });

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.6, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, [fadeAnim, slideAnim, glowAnim]);

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
      Alert.alert('Sign in failed', err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert(
        'Google Sign-In',
        'Google sign-in requires configuration. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID in your environment.',
      );
      return;
    }
    setLoading(true);
    try {
      await googlePromptAsync();
    } catch (err: any) {
      Alert.alert('Google Sign-In Error', err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAppleSignIn() {
    setLoading(true);
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
      } else {
        Alert.alert('Apple Sign-In', 'No identity token received. Please try again.');
        setLoading(false);
      }
    } catch (err: any) {
      setLoading(false);
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign-In Error', err?.message || 'Apple sign-in failed. Please try again.');
      }
    }
  }

  async function handlePhoneContinue() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return;
    const formatted = `+1${digits.slice(-10)}`;
    setLoading(true);
    try {
      await api.auth.requestOtp(formatted);
    } catch {
      // Backend unavailable — continue to verify screen anyway (demo mode)
    }
    setLoading(false);
    router.push({ pathname: '/onboarding/verify', params: { phone: formatted } });
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Wordmark */}
          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.wordmark}>Wingman</Text>
          </Animated.View>

          {/* Pip mascot */}
          <Animated.View style={[styles.mascotContainer, { opacity: fadeAnim }]}>
            <Animated.View style={[styles.tealGlow, { opacity: glowAnim }]} />
            <View style={styles.mascotRing}>
              <Image
                source={require('../../assets/pip/pip-happy.png')}
                style={styles.mascotImage}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          {/* SSO Buttons */}
          <Animated.View style={[styles.ssoSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Google Button */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              disabled={loading}
              activeOpacity={0.85}
            >
              <View style={styles.googleIconBox}>
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
                <Ionicons name="logo-apple" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
                <Text style={styles.appleText}>Continue with Apple</Text>
              </TouchableOpacity>
            )}

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Phone input */}
            <View style={styles.phoneCard}>
              <View style={styles.phoneRow}>
                <Text style={styles.phonePrefix}>🇺🇸 +1</Text>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="(555) 000-0000"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={14}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.continueBtn, phone.replace(/\D/g, '').length < 10 && styles.continueBtnDisabled]}
              onPress={handlePhoneContinue}
              disabled={loading || phone.replace(/\D/g, '').length < 10}
              activeOpacity={0.85}
            >
              <Text style={styles.continueBtnText}>Continue</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Terms */}
          <Text style={styles.terms}>
            By continuing, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
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
  wordmark: {
    color: colors.text,
    fontSize: 32,
    fontFamily: fonts.bold,
    textAlign: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  mascotContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 140,
    height: 140,
    marginBottom: spacing.lg,
  },
  tealGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.accentGlow,
  },
  mascotRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.card,
    borderWidth: 3,
    borderColor: colors.teal,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow(colors.teal),
  },
  mascotImage: { width: 100, height: 100 },

  ssoSection: {
    width: '100%',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.button,
    height: 54,
    marginBottom: 12,
    ...shadows.md,
  },
  googleIconBox: {
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
    fontFamily: fonts.semiBold,
    color: '#1f1f1f',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: radius.button,
    height: 54,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
    ...shadows.md,
  },
  appleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
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
    fontWeight: '600',
    marginHorizontal: 16,
  },
  phoneCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  phonePrefix: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    paddingRight: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  phoneInput: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    paddingVertical: 4,
  },
  continueBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  continueBtnDisabled: {
    opacity: 0.5,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: fonts.bold,
  },
  terms: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
  termsLink: {
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
