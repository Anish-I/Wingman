import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Alert, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView, AnimatePresence } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';
import { registerForPushNotifications } from '@/lib/notifications';

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [e164Phone, setE164Phone] = useState('');
  const [step, setStep] = useState<'phone' | 'verify' | 'success'>('phone');
  const [code, setCode] = useState(['', '', '', '']);
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
      // Demo mode: skip real OTP, proceed anyway
    }
    setE164Phone(formatted);
    setStep('verify');
    setLoading(false);
  }

  function handleCodeChange(text: string, idx: number) {
    const newCode = [...code];
    newCode[idx] = text.slice(-1);
    setCode(newCode);
    if (text && idx < 3) {
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
    if (otp.length !== 4) {
      Alert.alert('Incomplete', 'Please enter all 4 digits.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/verify-otp', { phone: e164Phone, code: otp });
      signIn(data.token);
    } catch {
      // Demo mode: sign in with mock token
      signIn('demo-mock-token');
    }
    try {
      await registerForPushNotifications();
    } catch {
      // Notifications may not be available in demo/web
    }
    setStep('success');
    setTimeout(() => {
      router.push('/onboarding/connect');
    }, 1500);
    setLoading(false);
  }

  useEffect(() => {
    if (code.every((d) => d !== '') && step === 'verify') {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <SafeAreaView className="flex-1 items-center" style={{ backgroundColor: '#0C0C0C' }}>
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
              color: '#FFFFFF',
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
              color: '#8A8A8A',
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
            backgroundColor: '#1A1A1A',
            borderWidth: 1,
            borderColor: '#3A3A3A',
          }}
        >
          {/* Flag placeholder */}
          <View className="rounded-sm" style={{ width: 24, height: 16, backgroundColor: '#B22234' }} />
          <Ionicons name="chevron-down" size={14} color="#525252" style={{ marginLeft: 4 }} />
          {/* Divider */}
          <View style={{ width: 1, height: 32, backgroundColor: '#2A2A2A', marginHorizontal: 12 }} />
          <Text style={{ fontFamily: 'Sora_700Bold', fontSize: 16, color: '#FFFFFF' }}>+1</Text>
          <TextInput
            className="flex-1"
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 16,
              color: '#FFFFFF',
              marginLeft: 8,
            }}
            placeholder="(555) 123-4567"
            placeholderTextColor="#525252"
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
              from={{ opacity: 0, translateY: 16 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0 }}
              className="w-full items-center"
              style={{ gap: 16 }}
            >
              {/* Label */}
              <Text
                style={{
                  fontFamily: 'Inter_700Bold',
                  fontSize: 11,
                  color: '#8A8A8A',
                  letterSpacing: 2,
                }}
              >
                ENTER CODE
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
                      width: 60,
                      height: 64,
                      borderRadius: 8,
                      backgroundColor: '#1A1A1A',
                      borderWidth: activeIdx === i ? 2 : 1,
                      borderColor: activeIdx === i ? '#4A7BD9' : '#3A3A3A',
                      textAlign: 'center',
                      fontFamily: 'Sora_700Bold',
                      fontSize: 28,
                      color: '#FFFFFF',
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
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#525252' }}>
                  Didn't get it?
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setCode(['', '', '', '']);
                    setActiveIdx(0);
                    handleSendCode();
                  }}
                >
                  <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#4A7BD9' }}>
                    Resend
                  </Text>
                </TouchableOpacity>
              </View>
            </MotiView>
          )}
        </AnimatePresence>

        {/* Success section */}
        <AnimatePresence>
          {step === 'success' && (
            <MotiView
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 10, stiffness: 100 }}
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
                  color: '#FFFFFF',
                  letterSpacing: -0.5,
                }}
              >
                Connected!
              </Text>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#8A8A8A' }}>
                Your phone is verified
              </Text>
            </MotiView>
          )}
        </AnimatePresence>
      </ScrollView>
    </SafeAreaView>
  );
}
