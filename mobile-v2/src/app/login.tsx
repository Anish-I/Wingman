import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';
import { FocusAwareStatusBar } from '@/components/ui';

export default function LoginScreen() {
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
      Alert.alert('Invalid number', 'Please enter a valid phone number.');
      return;
    }
    const formatted = `+1${cleaned.slice(-10)}`;
    setLoading(true);
    try {
      await client.post('/auth/request-otp', { phone: formatted });
    } catch {
      Alert.alert('Error', 'Could not send verification code. Please try again.');
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

  async function handleVerify() {
    const otp = code.join('');
    if (otp.length !== 6) {
      Alert.alert('Incomplete', 'Please enter all 6 digits.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/verify-otp', { phone: e164Phone, code: otp });
      signIn(data.token);
    } catch {
      Alert.alert('Invalid Code', 'The code you entered is incorrect. Please try again.');
      setCode(['', '', '', '', '', '']);
      setActiveIdx(0);
      inputs.current[0]?.focus();
    }
    setLoading(false);
  }

  useEffect(() => {
    if (code.every((d) => d !== '') && step === 'verify') {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <SafeAreaView className="flex-1 justify-center" style={{ backgroundColor: '#0C0C0C' }}>
      <FocusAwareStatusBar />
      <View className="px-8" style={{ gap: 24 }}>
        {/* Header */}
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontFamily: 'Sora_700Bold',
              fontSize: 28,
              color: '#FFFFFF',
              letterSpacing: -1,
            }}
          >
            Welcome back
          </Text>
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 15,
              color: '#8A8A8A',
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
                backgroundColor: '#1A1A1A',
                borderWidth: 1,
                borderColor: '#3A3A3A',
              }}
            >
              <Text style={{ fontFamily: 'Sora_700Bold', fontSize: 16, color: '#FFFFFF' }}>+1</Text>
              <View style={{ width: 1, height: 32, backgroundColor: '#2A2A2A', marginHorizontal: 12 }} />
              <TextInput
                className="flex-1"
                style={{
                  fontFamily: 'Inter_400Regular',
                  fontSize: 16,
                  color: '#FFFFFF',
                }}
                placeholder="(555) 123-4567"
                placeholderTextColor="#525252"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={14}
                autoFocus
              />
            </View>

            {/* Send button */}
            <TouchableOpacity
              className="rounded-lg items-center justify-center"
              style={{
                height: 52,
                backgroundColor: loading ? '#2A3F6E' : '#4A7BD9',
              }}
              onPress={handleSendCode}
              disabled={loading}
              activeOpacity={0.8}
            >
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: '#FFFFFF' }}>
                {loading ? 'Sending...' : 'Send Code'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* OTP boxes */}
            <View className="flex-row justify-center" style={{ gap: 10 }}>
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
                    backgroundColor: '#1A1A1A',
                    borderWidth: activeIdx === i ? 2 : 1,
                    borderColor: activeIdx === i ? '#4A7BD9' : '#3A3A3A',
                    textAlign: 'center',
                    fontFamily: 'Sora_700Bold',
                    fontSize: 24,
                    color: '#FFFFFF',
                  }}
                  value={digit}
                  onChangeText={(t) => handleCodeChange(t, i)}
                  onFocus={() => setActiveIdx(i)}
                  onKeyPress={(e) => handleKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  autoFocus={i === 0}
                />
              ))}
            </View>

            {/* Resend / Back */}
            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                onPress={() => {
                  setStep('phone');
                  setCode(['', '', '', '', '', '']);
                  setActiveIdx(0);
                }}
              >
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#525252' }}>
                  Change number
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setCode(['', '', '', '', '', '']);
                  setActiveIdx(0);
                  handleSendCode();
                }}
              >
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#4A7BD9' }}>
                  Resend Code
                </Text>
              </TouchableOpacity>
            </View>

            {loading && (
              <View className="items-center">
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#8A8A8A' }}>
                  Verifying...
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
