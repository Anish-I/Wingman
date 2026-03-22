import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FocusAwareStatusBar } from '@/components/ui';
import { purple, surface, text as t } from '@/components/ui/tokens';
import { signIn } from '@/features/auth/use-auth-store';
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
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [e164Phone, setE164Phone] = useState('');
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputs = useRef<TextInput[]>([]);

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
        showAlert('Sign-In Failed', 'No valid authentication token received. Please try again.');
        return;
      }
      signIn(data.token);
      setTimeout(() => router.replace('/(app)/chat'), 0);
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

  useEffect(() => {
    if (code.every(d => d !== '') && step === 'verify') {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  return (
    <SafeAreaView className="flex-1 justify-center" style={{ backgroundColor: surface.bg }}>
      <FocusAwareStatusBar />
      <View className="px-8" style={{ gap: 24 }}>
        {/* Header */}
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontFamily: 'Sora_700Bold',
              fontSize: 28,
              color: t.primary,
              letterSpacing: -1,
            }}
          >
            Welcome back
          </Text>
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 15,
              color: t.secondary,
            }}
          >
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
              style={{
                height: 56,
                backgroundColor: surface.card,
                borderWidth: 1,
                borderColor: surface.borderStrong,
              }}
            >
              <Text style={{ fontFamily: 'Sora_700Bold', fontSize: 16, color: t.primary }}>+1</Text>
              <View style={{ width: 1, height: 32, backgroundColor: surface.border, marginHorizontal: 12 }} />
              <TextInput
                className="flex-1"
                style={{
                  fontFamily: 'Inter_400Regular',
                  fontSize: 16,
                  color: t.primary,
                }}
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
            <Pressable
              style={[
                {
                  height: 52,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: loading ? purple[700] : purple[500],
                },
                Platform.OS === 'web' ? { cursor: loading ? 'default' : 'pointer' } as any : undefined,
              ]}
              onPress={handleSendCode}
              disabled={loading}
            >
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFFFFF' }}>
                {loading ? 'Sending...' : 'Send Code'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* OTP boxes */}
            <View className="flex-row justify-center" style={{ gap: 10 }}>
              {code.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(r) => {
                    if (r)
                      inputs.current[i] = r;
                  }}
                  style={{
                    width: 48,
                    height: 56,
                    borderRadius: 10,
                    backgroundColor: surface.card,
                    borderWidth: activeIdx === i ? 2 : 1,
                    borderColor: activeIdx === i ? purple[500] : surface.borderStrong,
                    textAlign: 'center',
                    fontFamily: 'Sora_700Bold',
                    fontSize: 24,
                    color: t.primary,
                  }}
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
            <Pressable
              style={[
                {
                  height: 52,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: loading ? purple[700] : purple[500],
                  opacity: code.join('').length < 6 && !loading ? 0.5 : 1,
                },
                Platform.OS === 'web' ? { cursor: loading ? 'default' : 'pointer' } as any : undefined,
              ]}
              onPress={handleVerify}
              disabled={loading}
            >
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFFFFF' }}>
                {loading ? 'Verifying...' : 'Verify Code'}
              </Text>
            </Pressable>

            {/* Resend / Back */}
            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={() => {
                  setStep('phone');
                  setCode(['', '', '', '', '', '']);
                  setActiveIdx(0);
                }}
                style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
              >
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: t.muted }}>
                  Change number
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setCode(['', '', '', '', '', '']);
                  setActiveIdx(0);
                  handleSendCode();
                }}
                style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: purple[400] }}>
                  Resend Code
                </Text>
              </Pressable>
            </View>
          </>
        )}
        {/* Sign up link */}
        <View className="mt-4 flex-row items-center justify-center">
          <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: t.muted }}>
            Don't have an account?{' '}
          </Text>
          <Pressable
            onPress={() => router.push('/onboarding/signup')}
            style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
          >
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: purple[400] }}>
              Sign Up
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
