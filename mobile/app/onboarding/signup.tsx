import React, { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius } from '../../src/theme';
import { api } from '../../src/api';
import { saveToken } from '../../src/auth';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

const redirectUri = AuthSession.makeRedirectUri({ preferLocalhost: true });

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

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
      <ProgressBar step={3} />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <PipCard expression="wave" size="small" />

          <Text style={styles.headline}>Join the Flock 🦩</Text>

          {/* Google SSO Button */}
          <TouchableOpacity
            style={styles.googleButton}
            onPress={handleGoogleSignIn}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleText}>Continue with Google</Text>
          </TouchableOpacity>

          {/* Apple SSO Button — iOS native only */}
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
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Name Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="given-name"
            />
          </View>

          {/* Sign In Link */}
          <View style={styles.signinRow}>
            <Text style={styles.signinMuted}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/onboarding/phone')}>
              <Text style={styles.signinLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" />
        ) : (
          <GradientButton
            title="Continue"
            onPress={() => router.push({ pathname: '/onboarding/phone', params: { name } })}
            gradientColors={['#9B7EC8', '#7B5EA8']}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    letterSpacing: 0.3,
  },
  // Google button — white bg with Google-colored G
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    height: 54,
    marginBottom: 12,
    paddingHorizontal: spacing.md,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4285F4',
    marginRight: 10,
  },
  googleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  // Apple button — black bg, white text
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: radius.md,
    height: 54,
    marginBottom: 12,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#333',
  },
  appleIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    marginRight: 10,
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
    backgroundColor: '#3A3B5C',
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 13,
    marginHorizontal: 14,
    textTransform: 'lowercase',
  },
  // Input
  inputContainer: { marginBottom: spacing.sm },
  input: {
    backgroundColor: '#242540',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    color: '#FFFFFF',
    fontSize: 17,
    borderWidth: 1,
    borderColor: '#3A3B5C',
  },
  // Sign in link
  signinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  signinMuted: {
    color: colors.textMuted,
    fontSize: 14,
  },
  signinLink: {
    color: '#6EC6B8',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
