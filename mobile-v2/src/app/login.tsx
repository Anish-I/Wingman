import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Button, FocusAwareStatusBar } from '@/components/ui';
import { layout, presets, purple, radii, spacing, typography, useThemeColors } from '@/components/ui/tokens';
import { fontScale } from '@/lib/responsive';
import { signIn, useAuthStore } from '@/features/auth/use-auth-store';
import { isValidAuthToken } from '@/lib/auth/utils';
import { client } from '@/lib/api/client';

/** Show a non-blocking toast notification on all platforms */
function showAlert(title: string, message: string) {
  showMessage({ message: title, description: message, type: 'danger', duration: 3000 });
}

export default function LoginScreen() {
  const { surface, text: t } = useThemeColors();
  const router = useRouter();
  const authStatus = useAuthStore.use.status();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [phone, setPhone] = useState('');
  const [e164Phone, setE164Phone] = useState('');
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [otpRequestId, setOtpRequestId] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputs = useRef<TextInput[]>([]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    safeArea: { backgroundColor: surface.bg },
    headerTitle: [styles.headerTitle, { color: t.primary }],
    headerSubtitle: [styles.headerSubtitle, { color: t.secondary }],
    phoneInputContainer: [presets.inputField, { paddingHorizontal: spacing.lg }],
    phoneInput: [styles.phoneInput, { color: t.primary }],
    signupText: [styles.signupText, { color: t.muted }],
  };
  const contentGap = { gap: isLandscape ? spacing.md : spacing['2xl'] };
  const otpRow = { gap: isLandscape ? spacing.sm : spacing.md };
  const otpBox = (i: number) => [
    styles.otpBox,
    {
      width: isLandscape ? 38 : 48,
      height: isLandscape ? 44 : 56,
      fontSize: isLandscape ? 18 : 24,
      backgroundColor: surface.card,
      borderWidth: activeIdx === i ? 2 : 1,
      borderColor: activeIdx === i ? purple[500] : surface.borderStrong,
      color: t.primary,
    },
  ];

  async function handleSendCode() {
    const trimmed = phone.trim();
    let formatted: string;
    if (trimmed.startsWith('+')) {
      // International: strip non-digits after the leading '+'
      formatted = '+' + trimmed.slice(1).replace(/\D/g, '');
    } else {
      // No country code provided — default to US (+1)
      const cleaned = trimmed.replace(/\D/g, '');
      formatted = `+1${cleaned.slice(-10)}`;
    }
    if (!/^\+[1-9]\d{1,14}$/.test(formatted)) {
      showAlert('Invalid number', 'Please enter a valid phone number with country code (e.g. +1 for US, +44 for UK).');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/request-otp', { phone: formatted });
      setOtpRequestId(data.otp_request_id);
      setResendCooldown(30);
    }
    catch {
      showAlert('Error', 'Could not send verification code. Please try again.');
      setLoading(false);
      return;
    }
    setE164Phone(formatted);
    setStep('verify');
    setLoading(false);
  }

  function focusInput(idx: number) {
    const input = inputs.current[idx];
    if (!input) return;
    input.focus();
    if (Platform.OS === 'web' && input instanceof HTMLElement) {
      input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function handleCodeChange(text: string, idx: number) {
    const digits = text.replace(/\D/g, '');
    if (!digits) return; // ignore purely non-numeric input (e.g. pasted letters)
    if (digits.length > 1) {
      // Paste: distribute digits across boxes starting at idx
      const newCode = [...code];
      for (let i = 0; i < digits.length && idx + i < 6; i++) {
        newCode[idx + i] = digits[i];
      }
      setCode(newCode);
      const nextIdx = Math.min(idx + digits.length, 5);
      focusInput(nextIdx);
      setActiveIdx(nextIdx);
      return;
    }
    const newCode = [...code];
    newCode[idx] = digits;
    setCode(newCode);
    if (digits && idx < 5) {
      focusInput(idx + 1);
      setActiveIdx(idx + 1);
    }
  }

  function handleKeyPress(e: any, idx: number) {
    if (e.nativeEvent.key === 'Backspace' && !code[idx] && idx > 0) {
      focusInput(idx - 1);
      setActiveIdx(idx - 1);
    }
  }

  const verifyingRef = useRef(false);

  // Stable ref so the auto-submit effect always calls the latest closure
  // without needing handleVerify in its dependency array.
  const handleVerifyRef = useRef<(otpOverride?: string) => Promise<void>>(null!);

  async function handleVerify(otpOverride?: string) {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    const otp = otpOverride ?? code.join('');
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      verifyingRef.current = false;
      showAlert('Incomplete', 'Please enter all 6 digits.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/verify-otp', { phone: e164Phone, code: otp, otp_request_id: otpRequestId });
      // Validate token structure and required claims (exp, userId)
      if (!isValidAuthToken(data.token)) {
        showAlert('Sign-In Failed', 'No valid authentication token received. Please try again.');
        setCode(['', '', '', '', '', '']);
        setActiveIdx(0);
        focusInput(0);
        return;
      }
      signIn(data.token);
      // Navigation is handled declaratively via <Redirect> at the top of the
      // component — it fires only after React re-renders with the settled auth
      // state, eliminating the race with the (app)/_layout.tsx auth guard.
    }
    catch (err: any) {
      const message = err?.response?.data?.error || 'The code you entered is incorrect. Please try again.';
      showAlert('Invalid Code', message);
      setCode(['', '', '', '', '', '']);
      setActiveIdx(0);
      focusInput(0);
    }
    finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  }

  handleVerifyRef.current = handleVerify;

  useEffect(() => {
    if (step === 'verify' && code.every(d => d !== '') && !verifyingRef.current) {
      // handleVerify's own synchronous guard (set before the first await)
      // prevents duplicate calls even under StrictMode double-fire.
      handleVerifyRef.current(code.join(''));
    }
  }, [code, step]);

  // Declarative redirect: only fires after React re-renders with updated auth
  // state, avoiding the race where an imperative router.replace() navigates
  // before the auth guard in (app)/_layout.tsx sees the new token.
  if (authStatus === 'signIn') {
    return <Redirect href="/(app)/chat" />;
  }

  return (
    <SafeAreaView className="flex-1" style={themed.safeArea}>
      <FocusAwareStatusBar />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingVertical: isLandscape ? spacing.lg : 0 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[{ paddingHorizontal: layout.screenPaddingH }, contentGap]}>
        {/* Header */}
        <View style={styles.headerGroup}>
          <Text style={themed.headerTitle}>
            Welcome back
          </Text>
          <Text style={themed.headerSubtitle}>
            {step === 'phone'
              ? 'Enter your phone number to sign in'
              : `Enter the 6-digit code sent to ${e164Phone}`}
          </Text>
        </View>

        {step === 'phone' ? (
          <>
            {/* Phone input */}
            <View
              className="flex-row items-center"
              style={themed.phoneInputContainer}
            >
              <TextInput
                className="flex-1"
                style={themed.phoneInput}
                placeholder="+1 (555) 123-4567"
                placeholderTextColor={t.muted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={20}
                autoFocus
              />
            </View>

            {/* Send button */}
            <Button
              accessibilityLabel={loading ? 'Sending verification code' : 'Send verification code'}
              variant="primary"
              label={loading ? 'Sending...' : 'Send Code'}
              onPress={handleSendCode}
              loading={loading}
              disabled={loading}
            />
          </>
        ) : (
          <>
            {/* OTP boxes */}
            <View className="flex-row justify-center" style={otpRow}>
              {code.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(r) => {
                    if (r)
                      inputs.current[i] = r;
                  }}
                  style={otpBox(i)}
                  value={digit}
                  onChangeText={txt => handleCodeChange(txt, i)}
                  onFocus={() => setActiveIdx(i)}
                  onKeyPress={e => handleKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={6}
                  selectTextOnFocus
                  autoFocus={i === 0}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  accessibilityLabel={`Digit ${i + 1} of 6`}
                  accessibilityHint="Enter a single digit of your verification code"
                />
              ))}
            </View>

            {/* Verify button */}
            <Button
              accessibilityLabel={loading ? 'Verifying code' : 'Verify code'}
              variant="primary"
              label={loading ? 'Verifying...' : 'Verify Code'}
              onPress={() => handleVerify()}
              loading={loading}
              disabled={loading || code.join('').length < 6}
            />

            {/* Resend / Back */}
            <View className="flex-row items-center justify-between">
              <Button
                accessibilityLabel="Change phone number"
                variant="ghost"
                size="sm"
                label="Change number"
                onPress={() => {
                  setStep('phone');
                  setCode(['', '', '', '', '', '']);
                  setActiveIdx(0);
                }}
              />
              <Button
                accessibilityLabel={resendCooldown > 0 ? `Resend available in ${resendCooldown} seconds` : 'Resend verification code'}
                variant="link"
                size="sm"
                label={resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                disabled={resendCooldown > 0}
                onPress={() => {
                  setCode(['', '', '', '', '', '']);
                  setActiveIdx(0);
                  handleSendCode();
                }}
              />
            </View>
          </>
        )}
        {/* Sign up link */}
        <View className="flex-row items-center justify-center" style={{ marginTop: spacing.lg }}>
          <Text style={themed.signupText}>
            Don't have an account?{' '}
          </Text>
          <Button
            accessibilityRole="link"
            accessibilityLabel="Sign up for a new account"
            variant="link"
            size="sm"
            label="Sign Up"
            fullWidth={false}
            onPress={() => router.push('/onboarding/signup')}
          />
        </View>
      </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  headerGroup: {
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.hero,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontScale(15),
  },
  phoneInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontScale(16),
  },
  otpBox: {
    borderRadius: radii.md,
    textAlign: 'center',
    fontFamily: 'Sora_700Bold',
  },
  signupText: {
    fontFamily: 'Inter_400Regular',
    fontSize: fontScale(13),
  },
});
