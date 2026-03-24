import { Ionicons } from '@expo/vector-icons';
import Env from 'env';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { MotiView } from 'moti';
import * as React from 'react';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { base, purple, surfaceLight, typography, useThemeColors } from '@/components/ui/tokens';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import SectionLabel from '@/components/wingman/section-label';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';
import { setItem, removeItem, getItem } from '@/lib/storage';
import { entrance, pressStyle, webInteractive, useReducedMotion, maybeReduce } from '@/lib/motion';

/** Generate a cryptographically random hex string for OAuth CSRF protection. */
function generateOAuthState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    showMessage({ message: title, description: message, type: 'danger', duration: 3000 });
  }
  else {
    Alert.alert(title, message);
  }
}

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

function AppleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={base.black}>
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const { surface, text: t } = useThemeColors();
  const reduced = useReducedMotion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const codeExchangedRef = useRef(false);
  const googleSignInActiveRef = useRef(false);

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    safeArea: [styles.safeArea, { backgroundColor: surface.bg }],
    title: { color: t.primary },
    formContainer: styles.formContainer,
    inputRow: [styles.inputRow, { backgroundColor: surface.elevated, borderColor: surface.border }],
    inputText: { color: t.primary },
    dividerLine: [styles.dividerLine, { backgroundColor: surface.border }],
    dividerText: { color: t.muted },
    socialContainer: styles.socialContainer,
    googleButton: [styles.googleButton, { borderColor: surface.borderStrong, backgroundColor: surface.card }],
    googleButtonHovered: { backgroundColor: surface.cardAlt, borderColor: surface.border },
    socialButtonText: { color: t.primary },
    trustBadge: [styles.trustBadge, { backgroundColor: surface.section, borderColor: surface.border }],
    trustText: { color: t.secondary },
    footerText: { color: t.secondary },
  };

  async function handleSignUp() {
    if (!email || !password) {
      showAlert('Missing fields', 'Please enter your email and password.');
      return;
    }
    if (password.length < 8) {
      showAlert('Weak password', 'Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      showAlert('Weak password', 'Password must include uppercase, lowercase, digit, and special character.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/signup', { email, password });
      // Validate token is a well-formed JWT (three base64url segments)
      if (!data.token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.token)) {
        showAlert('Sign-Up Failed', 'Authentication token was not generated. Please try again.');
        setLoading(false);
        return;
      }
      signIn(data.token);
      router.push('/onboarding/permissions');
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Sign-up failed. Please try again.';
      showAlert('Sign-Up Error', message);
    } finally {
      setLoading(false);
    }
  }

  // Exchange a short-lived auth code for a JWT via the server.
  // Guarded by a ref so a double-fire of the OAuth callback cannot
  // exchange the code twice and cause inconsistent auth state.
  async function exchangeAuthCode(code: string): Promise<boolean> {
    if (codeExchangedRef.current) return false;
    codeExchangedRef.current = true;
    try {
      const res = await client.post('/auth/exchange-code', { code });
      const { token } = res.data;
      // Validate token is a well-formed JWT (three base64url segments)
      if (token && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
        signIn(token);
        router.push('/onboarding/permissions');
        return true;
      }
    } catch (err) {
      console.error('Auth code exchange failed:', err);
    }
    // Don't reset the guard — auth codes are single-use, so a second
    // callback fire with the same code should be silently dropped.
    return false;
  }

  async function handleGoogleSignIn() {
    // Ref-based guard prevents concurrent execution — React state updates
    // are async, so `disabled={loading}` alone can't block a rapid double-tap
    // or back/forward before re-render.
    if (googleSignInActiveRef.current) return;
    googleSignInActiveRef.current = true;
    setLoading(true);
    codeExchangedRef.current = false;
    try {
      // Generate a CSRF token and store it locally with the intended return path.
      // The server echoes this back in the redirect so both the inline (WebBrowser)
      // and fallback (callback.tsx) flows can verify the OAuth session is genuine.
      const clientState = generateOAuthState();
      setItem('oauth_pending', { clientState, returnTo: '/onboarding/permissions' });

      if (Platform.OS === 'web') {
        // On web, use popup-based flow with web-safe redirect
        const webOrigin = encodeURIComponent(window.location.origin);
        const result = await WebBrowser.openAuthSessionAsync(
          `${Env.EXPO_PUBLIC_API_URL}/auth/google?platform=web&webOrigin=${webOrigin}&clientState=${clientState}`,
          `${window.location.origin}/connect/callback`,
        );
        if (result.type === 'success' && result.url) {
          const url = new URL(result.url);
          const returnedState = url.searchParams.get('clientState');
          const pending = getItem<{ clientState: string }>('oauth_pending');
          removeItem('oauth_pending');
          if (!pending || !returnedState || pending.clientState !== returnedState) {
            showAlert('Sign-In Failed', 'OAuth session mismatch. Please try again.');
            return;
          }
          const code = url.searchParams.get('code');
          if (code && await exchangeAuthCode(code)) return;
        }
        removeItem('oauth_pending');
        showAlert('Sign-In Cancelled', 'Google sign-in was cancelled or failed. Please try again.');
        return;
      }

      // Native: use deep link redirect
      const result = await WebBrowser.openAuthSessionAsync(
        `${Env.EXPO_PUBLIC_API_URL}/auth/google?clientState=${clientState}`,
        'wingman://auth/callback',
      );
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const returnedState = url.searchParams.get('clientState');
        const pending = getItem<{ clientState: string }>('oauth_pending');
        removeItem('oauth_pending');
        if (!pending || !returnedState || pending.clientState !== returnedState) {
          showAlert('Sign-In Failed', 'OAuth session mismatch. Please try again.');
          return;
        }
        const code = url.searchParams.get('code');
        if (code && await exchangeAuthCode(code)) return;
        showAlert('Sign-In Failed', 'No valid authentication received from server.');
      } else {
        removeItem('oauth_pending');
        showAlert('Sign-In Cancelled', 'Google sign-in was cancelled.');
      }
    }
    catch (err) {
      removeItem('oauth_pending');
      console.error('Google sign-in error:', err);
      showAlert('Sign-In Error', 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
      googleSignInActiveRef.current = false;
    }
  }

  async function handleAppleSignIn() {
    if (Platform.OS !== 'ios') {
      showAlert('Not Available', 'Apple Sign-In is only available on iOS devices.');
      return;
    }
    setLoading(true);
    try {
      showAlert('Coming Soon', 'Apple Sign-In will be available in a future update.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={themed.safeArea}>
      <ProgressBar step={3} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="px-6 pb-8 items-center" keyboardShouldPersistTaps="handled">
          <PipCard expression="excited" size="small" />

          <View className="mt-4 mb-2 self-center">
            <SectionLabel text="JOIN THE FLOCK" />
          </View>

          <Text style={[styles.title, themed.title]}>
            {'Create Your\nAccount'}
          </Text>

          {/* Form */}
          <View style={themed.formContainer}>
            {/* Email input */}
            <View style={themed.inputRow}>
              <Ionicons name="mail-outline" size={18} color={t.secondary} />
              <TextInput
                className="flex-1 text-[14px]"
                style={themed.inputText}
                placeholder="Email address"
                placeholderTextColor={t.disabled}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                editable={!loading}
              />
            </View>

            {/* Password input */}
            <View style={themed.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={t.secondary} />
              <TextInput
                className="flex-1 text-[14px]"
                style={themed.inputText}
                placeholder="Password (A-z, 0-9, special, 8+ chars)"
                placeholderTextColor={t.disabled}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                editable={!loading}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
              >
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color={t.secondary} />
              </Pressable>
            </View>
          </View>

          <View className="mt-4 w-full">
            <GradientButton title={loading ? "Signing Up..." : "Sign Up"} onPress={handleSignUp} disabled={loading} />
          </View>

          {/* Divider */}
          <View className="my-5 w-full flex-row items-center">
            <View style={themed.dividerLine} />
            <Text style={[styles.dividerText, themed.dividerText]}>
              or continue with
            </Text>
            <View style={themed.dividerLine} />
          </View>

          {/* Social buttons */}
          <MotiView {...maybeReduce(entrance(0, 280), reduced)} style={themed.socialContainer}>
            <Pressable
              style={({ pressed, hovered }) => [
                themed.googleButton,
                ...pressStyle({ pressed }),
                webInteractive(),
                Platform.OS === 'web' && hovered && !pressed
                  ? themed.googleButtonHovered
                  : undefined,
              ]}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <GoogleIcon />
              <Text style={[styles.socialButtonText, themed.socialButtonText]}>
                Google
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed, hovered }) => [
                styles.appleButton,
                ...pressStyle({ pressed }),
                webInteractive(),
                Platform.OS === 'web' && hovered && !pressed
                  ? styles.appleButtonHovered
                  : undefined,
              ]}
              onPress={handleAppleSignIn}
              disabled={loading}
            >
              <AppleIcon />
              <Text style={styles.appleButtonText}>
                Apple
              </Text>
            </Pressable>
          </MotiView>

          {/* Trust / security note — elevated badge style */}
          <View style={themed.trustBadge}>
            <Ionicons name="shield-checkmark-outline" size={16} color={purple[500]} />
            <Text style={[styles.trustText, themed.trustText]}>
              Your data is encrypted and secure
            </Text>
          </View>

          {/* Footer — link to login */}
          <View className="mt-4 mb-4 flex-row items-center justify-center">
            <Text style={[styles.footerText, themed.footerText]}>
              Already have an account?
              {' '}
            </Text>
            <Pressable
              onPress={() => router.push('/login')}
              style={({ pressed, hovered }) => [
                ...pressStyle({ pressed }),
                webInteractive(),
                Platform.OS === 'web' && hovered && !pressed ? { opacity: 0.8 } : undefined,
              ]}
            >
              <Text style={styles.signInLink}>
                Sign In
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- Extracted from themed object ---
  safeArea: {
    flex: 1,
  },
  formContainer: {
    gap: 14,
    width: '100%',
  },
  inputRow: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  socialContainer: {
    gap: 12,
    width: '100%',
  },
  googleButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    width: '100%',
  },
  // --- Original static styles ---
  title: {
    ...typography.hero,
    textAlign: 'center',
    marginBottom: 20,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginHorizontal: 16,
  },
  socialButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  appleButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: surfaceLight.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  appleButtonHovered: {
    backgroundColor: '#F5F5F5',
  },
  appleButtonText: {
    color: base.black,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  trustText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    flex: 1,
    textAlign: 'center',
  },
  footerText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  signInLink: {
    color: purple[400],
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    textDecorationLine: 'underline',
  },
});
