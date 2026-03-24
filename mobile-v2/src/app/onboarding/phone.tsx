import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Alert, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView, AnimatePresence } from 'moti';
import { showMessage } from 'react-native-flash-message';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';
import { useThemeColors } from '@/components/ui/tokens';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';
import { registerForPushNotifications } from '@/lib/notifications';
import { useReducedMotion } from '@/lib/motion';

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
  const inputs = useRef<TextInput[]>([]);
  const verifyingRef = useRef(false);

  async function handleSendCode() {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      showAlert('Invalid number', 'Please enter a valid phone number.');
      return;
    }
    const formatted = `+1${cleaned.slice(-10)}`;
    setLoading(true);
    try {
      await client.post('/auth/request-otp', { phone: formatted });
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

  async function handleVerify() {
    if (verifyingRef.current) return;
    const otp = code.join('');
    if (otp.length !== 6) {
      showAlert('Incomplete', 'Please enter all 6 digits.');
      return;
    }
    verifyingRef.current = true;
    setLoading(true);
    try {
      const { data } = await client.post('/auth/verify-otp', { phone: e164Phone, code: otp });
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

  useEffect(() => {
    if (code.every((d) => d !== '') && step === 'verify') {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  return (
    <SafeAreaView className="flex-1 items-center" style={{ backgroundColor: surface.bg }}>
      <ProgressBar step={5} />
      <ScrollView
        className="flex-1 w-full"
        contentContainerClassName="px-6 items-center"
        contentContainerStyle={{ gap: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Pip */}
        <PipCard expression="thumbsup" size="medium" />

        {/* Header */}
        <View className="items-center" style={{ gap: 8 }}>
          <SectionLabel text="VERIFY PHONE" />
          <Text
            style={{
              fontFamily: 'Sora_700Bold',
              fontSize: 32,
              color: t.primary,
              letterSpacing: -1.5,
              lineHeight: 32,
              textAlign: 'center',
            }}
          >
            {"What's your\nnumber?"}
          </Text>
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 14,
              color: t.muted,
              textAlign: 'center',
            }}
          >
            I'll send you a quick text to verify
          </Text>
        </View>

        {/* Phone input row */}
        <View
          className="w-full flex-row items-center rounded-lg px-4"
          style={{
            height: 56,
            backgroundColor: surface.section,
            borderWidth: 1,
            borderColor: surface.borderStrong,
          }}
        >
          {/* US-only country indicator (static) */}
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: t.muted }}>
            +1 (US)
          </Text>
          {/* Divider */}
          <View style={{ width: 1, height: 32, backgroundColor: surface.border, marginHorizontal: 12 }} />
          <TextInput
            className="flex-1"
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 16,
              color: t.primary,
              marginLeft: 8,
            }}
            placeholder="(555) 123-4567"
            placeholderTextColor={t.disabled}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={14}
          />
        </View>

        {/* Send button */}
        <View className="w-full">
          <GradientButton
            title={loading && step === 'phone' ? 'Sending...' : 'Text Me'}
            onPress={handleSendCode}
            icon="send-outline"
            disabled={loading && step === 'phone'}
          />
        </View>

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
              style={{ gap: 16 }}
            >
              {/* Label */}
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 11,
                  color: t.muted,
                  letterSpacing: 2,
                }}
              >
                ENTER CODE
              </Text>
              <Text
                style={{
                  fontFamily: 'Inter_400Regular',
                  fontSize: 13,
                  color: t.disabled,
                  textAlign: 'center',
                  marginTop: -8,
                }}
              >
                {loading ? 'Verifying...' : 'Verifies automatically after entering all 6 digits'}
              </Text>

              {/* OTP boxes */}
              <View className="flex-row justify-center" style={{ gap: 12 }}>
                {code.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => {
                      if (r) inputs.current[i] = r;
                    }}
                    style={{
                      width: 48,
                      height: 56,
                      borderRadius: 8,
                      backgroundColor: surface.section,
                      borderWidth: activeIdx === i ? 2 : 1,
                      borderColor: activeIdx === i ? '#6B9BEF' : surface.borderStrong,
                      textAlign: 'center',
                      fontFamily: 'Sora_700Bold',
                      fontSize: 24,
                      color: t.primary,
                    }}
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
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: t.disabled }}>
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
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#6B9BEF' }}>
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
                transition: { type: 'spring', damping: 10, stiffness: 100 },
              })}
              className="items-center"
              style={{ gap: 12 }}
            >
              <View
                className="rounded-full items-center justify-center"
                style={{ width: 56, height: 56, backgroundColor: '#32D74B' }}
              >
                <Ionicons name="checkmark" size={28} color="#FFFFFF" />
              </View>
              <Text
                style={{
                  fontFamily: 'Sora_700Bold',
                  fontSize: 22,
                  color: t.primary,
                  letterSpacing: -0.5,
                }}
              >
                Connected!
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: t.muted }}>
                Your phone is verified
              </Text>
            </MotiView>
          )}
        </AnimatePresence>
      </ScrollView>
    </SafeAreaView>
  );
}
