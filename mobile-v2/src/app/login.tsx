import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Button, FocusAwareStatusBar } from '@/components/ui';
import { purple, typography, useThemeColors } from '@/components/ui/tokens';
import { signIn, useAuthStore } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';

/** Show a toast on web (FlashMessage) or native Alert */
function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    showMessage({ message: title, description: message, type: 'danger', duration: 3000 });
  }
  else {
    Alert.alert(title, message);
  }
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
  const inputs = useRef<TextInput[]>([]);

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    safeArea: { backgroundColor: surface.bg },
    headerTitle: [styles.headerTitle, { color: t.primary }],
    headerSubtitle: [styles.headerSubtitle, { color: t.secondary }],
    phoneInputContainer: [styles.phoneInputContainer, { backgroundColor: surface.card, borderColor: surface.borderStrong }],
    phoneCountryCode: [styles.phoneCountryCode, { color: t.primary }],
    phoneDivider: [styles.phoneDivider, { backgroundColor: surface.border }],
    phoneInput: [styles.phoneInput, { color: t.primary }],
    signupText: [styles.signupText, { color: t.muted }],
  };
  const contentGap = { gap: isLandscape ? 14 : 24 };
  const otpRow = { gap: isLandscape ? 6 : 10 };
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
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      showAlert('Invalid number', 'Please enter a valid phone number.');
      return;
    }
    const formatted = `+1${cleaned.slice(-10)}`;
    setLoading(true);
    try {
      const { data } = await client.post('/auth/request-otp', { phone: formatted });
      setOtpRequestId(data.otp_request_id);
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

  function handleCodeChange(text: string, idx: number) {
    const newCode = [...code];
    newCode[idx] = text.slice(-1);
    setCode(newCode);
    if (text && idx < 5) {
      inputs.current[idx + 1]?.focus();
      setActiveIdx(idx + 1);
    }
  }

  function handleKeyPress(e: any, idx: number) {
    if (e.nativeEvent.key === 'Backspace' && !code[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
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
    if (otp.length !== 6) {
      verifyingRef.current = false;
      showAlert('Incomplete', 'Please enter all 6 digits.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/verify-otp', { phone: e164Phone, code: otp, otp_request_id: otpRequestId });
      // Validate token is a well-formed JWT (three base64url segments)
      if (!data.token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.token)) {
        showAlert('Sign-In Failed', 'No valid authentication token received. Please try again.');
        setCode(['', '', '', '', '', '']);
        setActiveIdx(0);
        inputs.current[0]?.focus();
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
      inputs.current[0]?.focus();
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
            { paddingVertical: isLandscape ? 16 : 0 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View className="px-8" style={contentGap}>
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
              className="flex-row items-center rounded-lg px-4"
              style={themed.phoneInputContainer}
            >
              <Text style={themed.phoneCountryCode}>+1</Text>
              <View style={themed.phoneDivider} />
              <TextInput
                className="flex-1"
                style={themed.phoneInput}
                placeholder="(555) 123-4567"
                placeholderTextColor={t.muted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={14}
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
                  maxLength={1}
                  selectTextOnFocus
                  autoFocus={i === 0}
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
                accessibilityLabel="Resend verification code"
                variant="link"
                size="sm"
                label="Resend Code"
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
        <View className="mt-4 flex-row items-center justify-center">
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
    gap: 8,
  },
  headerTitle: {
    ...typography.hero,
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  phoneInputContainer: {
    height: 56,
    borderWidth: 1,
  },
  phoneCountryCode: {
    fontFamily: 'Sora_700Bold',
    fontSize: 16,
  },
  phoneDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 12,
  },
  phoneInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
  },
  otpBox: {
    borderRadius: 10,
    textAlign: 'center',
    fontFamily: 'Sora_700Bold',
  },
  signupText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
});
