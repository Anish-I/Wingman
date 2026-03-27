import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Alert, ScrollView, Pressable, Platform, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView, AnimatePresence } from 'moti';
import { showMessage } from 'react-native-flash-message';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';
import { base, layout, presets, radii, semantic, spacing, typography, useThemeColors } from '@/components/ui/tokens';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';
import { registerForPushNotifications } from '@/lib/notifications';
import { springs, useReducedMotion } from '@/lib/motion';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    showMessage({ message: title, description: message, type: 'danger', duration: 3000 });
  } else {
    Alert.alert(title, message);
  }
}

export default function PhoneScreen() {
  const { surface, text: t } = useThemeColors();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [phone, setPhone] = useState('');
  const [e164Phone, setE164Phone] = useState('');
  const [step, setStep] = useState<'phone' | 'verify' | 'success'>('phone');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [otpRequestId, setOtpRequestId] = useState('');
  const inputs = useRef<TextInput[]>([]);
  const verifyingRef = useRef(false);

  // Stable ref so the auto-submit effect always calls the latest closure
  // without needing handleVerify in its dependency array.
  const handleVerifyRef = useRef<(otpOverride?: string) => Promise<void>>(null!);

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    safeArea: { backgroundColor: surface.bg },
    headerTitle: { color: t.primary },
    headerSubtitle: { color: t.muted },
    phoneRow: [presets.inputField, { paddingHorizontal: spacing.lg }],
    countryLabel: [styles.countryLabel, { color: t.muted }],
    divider: [styles.divider, { backgroundColor: surface.border }],
    phoneInput: { color: t.primary },
    otpLabel: { color: t.muted },
    otpHint: { color: t.disabled },
    otpBoxBase: [styles.otpBoxBase, { backgroundColor: surface.section, color: t.primary }],
    resendLabel: [styles.resendLabel, { color: t.disabled }],
    successTitle: { color: t.primary },
    successSubtitle: [styles.successSubtitle, { color: t.muted }],
  };

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
      setE164Phone(formatted);
      setStep('verify');
    } catch (err: any) {
      const rawErr = err?.response?.data?.error;
      let message =
        typeof rawErr === 'object' && rawErr !== null
          ? rawErr.message ?? JSON.stringify(rawErr)
          : rawErr;
      if (!message) {
        if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
          message = 'Request timed out. Check your connection and try again.';
        } else if (!err?.response && err?.request) {
          message = 'Network error — check your internet connection and try again.';
        } else {
          message = 'Could not send verification code. Please try again.';
        }
      }
      showAlert('Error', String(message));
    } finally {
      setLoading(false);
    }
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
      // Validate that a real token was returned (not a demo token or undefined)
      if (!data.token || data.token === 'demo-mock-token') {
        showAlert('Verification Failed', 'No valid authentication token received. Please try again.');
        setCode(['', '', '', '', '', '']);
        setActiveIdx(0);
        inputs.current[0]?.focus();
        return;
      }
      signIn(data.token);
      try {
        await registerForPushNotifications();
      } catch {
        // Notifications may not be available on web
      }
      setStep('success');
      setTimeout(() => {
        router.push('/onboarding/connect');
      }, 1500);
    } catch (err: any) {
      const rawVerifyErr = err?.response?.data?.error;
      let message =
        typeof rawVerifyErr === 'object' && rawVerifyErr !== null
          ? rawVerifyErr.message ?? JSON.stringify(rawVerifyErr)
          : rawVerifyErr;
      if (!message) {
        if (err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')) {
          message = 'Request timed out. Check your connection and try again.';
        } else if (!err?.response && err?.request) {
          message = 'Network error — check your internet connection and try again.';
        } else {
          message = 'Invalid or expired code. Please try again.';
        }
      }
      showAlert('Verification Failed', String(message));
      setCode(['', '', '', '', '', '']);
      setActiveIdx(0);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  }

  handleVerifyRef.current = handleVerify;

  useEffect(() => {
    if (step === 'verify' && code.every((d) => d !== '') && !verifyingRef.current) {
      // handleVerify's own synchronous guard (set before the first await)
      // prevents duplicate calls even under StrictMode double-fire.
      handleVerifyRef.current(code.join(''));
    }
  }, [code, step]);

  return (
    <SafeAreaView className="flex-1 items-center" style={themed.safeArea}>
      <ProgressBar step={5} />
      <ScrollView
        className="flex-1 w-full"
        contentContainerClassName="items-center"
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: layout.screenPaddingH }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Pip */}
        <PipCard expression="thumbsup" size="medium" />

        {/* Header */}
        <View className="items-center" style={styles.headerGap}>
          <SectionLabel text="VERIFY PHONE" />
          <Text style={[styles.headerTitle, themed.headerTitle]}>
            {"What's your\nnumber?"}
          </Text>
          <Text style={[styles.headerSubtitle, themed.headerSubtitle]}>
            I'll send you a quick text to verify
          </Text>
        </View>

        {/* Phone input row */}
        <View
          className="w-full"
          style={themed.phoneRow}
        >
          {/* US-only country indicator (static) */}
          <Text style={themed.countryLabel}>
            +1 (US)
          </Text>
          {/* Divider */}
          <View style={themed.divider} />
          <TextInput
            className="flex-1"
            style={[styles.phoneInput, themed.phoneInput]}
            placeholder="(555) 123-4567"
            placeholderTextColor={t.disabled}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={14}
          />
        </View>

        {/* Send button — hidden once OTP entry is shown (auto-verify handles it) */}
        {step === 'phone' && (
          <View className="w-full">
            <GradientButton
              title={loading ? 'Sending...' : 'Text Me'}
              onPress={handleSendCode}
              icon="send-outline"
              disabled={loading}
            />
          </View>
        )}

        {/* OTP Section */}
        <AnimatePresence>
          {(step === 'verify' || step === 'success') && (
            <MotiView
              {...(reduced ? {} : {
                from: { opacity: 0, translateY: 16 },
                animate: { opacity: 1, translateY: 0 },
                exit: { opacity: 0 },
              })}
              className="w-full items-center"
              style={styles.otpSection}
            >
              {/* Label */}
              <Text style={[styles.otpLabel, themed.otpLabel]}>
                ENTER CODE
              </Text>
              <Text style={[styles.otpHint, themed.otpHint]}>
                {loading ? 'Verifying...' : 'Verifies automatically after entering all 6 digits'}
              </Text>

              {/* OTP boxes */}
              <View className="flex-row justify-center" style={styles.otpBoxRow}>
                {code.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => {
                      if (r) inputs.current[i] = r;
                    }}
                    style={[
                      themed.otpBoxBase,
                      {
                        borderWidth: activeIdx === i ? 2 : 1,
                        borderColor: activeIdx === i ? semantic.info : surface.borderStrong,
                      },
                    ]}
                    value={digit}
                    onChangeText={(t) => handleCodeChange(t, i)}
                    onFocus={() => setActiveIdx(i)}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                  />
                ))}
              </View>

              {/* Resend row */}
              <View className="flex-row items-center" style={styles.resendRow}>
                <Text style={themed.resendLabel}>
                  Didn't get it?
                </Text>
                <Pressable
                  onPress={() => {
                    setCode(['', '', '', '', '', '']);
                    setActiveIdx(0);
                    handleSendCode();
                  }}
                  style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
                >
                  <Text style={styles.resendLink}>
                    Resend
                  </Text>
                </Pressable>
              </View>
            </MotiView>
          )}
        </AnimatePresence>

        {/* Success section */}
        <AnimatePresence>
          {step === 'success' && (
            <MotiView
              {...(reduced ? {} : {
                from: { scale: 0, opacity: 0 },
                animate: { scale: 1, opacity: 1 },
                transition: springs.bouncy,
              })}
              className="items-center"
              style={styles.successSection}
            >
              <View
                className="rounded-full items-center justify-center"
                style={styles.successIcon}
              >
                <Ionicons name="checkmark" size={28} color={base.white} />
              </View>
              <Text style={[styles.successTitle, themed.successTitle]}>
                Connected!
              </Text>
              <Text style={themed.successSubtitle}>
                Your phone is verified
              </Text>
            </MotiView>
          )}
        </AnimatePresence>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- Extracted from themed object ---
  // phoneRow style removed — now uses presets.inputField from tokens
  countryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  divider: {
    width: 1,
    height: 32,
    marginHorizontal: spacing.md,
  },
  otpBoxBase: {
    width: 48,
    height: 56,
    borderRadius: radii.sm,
    textAlign: 'center',
    fontFamily: 'Sora_700Bold',
    fontSize: 24,
  },
  resendLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
  },
  successSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  // --- Original static styles ---
  scrollContent: {
    gap: spacing['2xl'],
  },
  headerGap: {
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.hero,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  phoneInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    marginLeft: spacing.sm,
  },
  otpSection: {
    gap: spacing.lg,
  },
  otpLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 2,
  },
  otpHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -spacing.sm,
  },
  otpBoxRow: {
    gap: spacing.md,
  },
  resendRow: {
    gap: spacing.xs,
  },
  resendLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: semantic.info,
  },
  successSection: {
    gap: spacing.md,
  },
  successIcon: {
    width: 56,
    height: 56,
    backgroundColor: semantic.success,
  },
  successTitle: {
    fontFamily: 'Sora_700Bold',
    fontSize: 22,
    letterSpacing: -0.5,
  },
});
