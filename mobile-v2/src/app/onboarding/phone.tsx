import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Alert, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView, AnimatePresence } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
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
      setE164Phone(formatted);
      setStep('verify');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send code.');
    } finally {
      setLoading(false);
    }
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
      await registerForPushNotifications();
      setStep('success');
      setTimeout(() => {
        router.push('/onboarding/connect');
      }, 1500);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (code.every(d => d !== '') && step === 'verify') {
      handleVerify();
    }
  }, [code]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ProgressBar step={5} />
      <KeyboardAvoidingView className="flex-1 px-6" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-1" />

        <AnimatePresence exitBeforeEnter>
          {step === 'phone' && (
            <MotiView key="phone" from={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PipCard expression="thinking" message="What's your number? I'll text you to confirm!" size="small" />
              <View className="flex-row items-center mt-6 gap-2">
                <View className="flex-row items-center bg-card rounded-[14px] px-4 py-4 border border-border gap-2">
                  <Text className="text-xl">🇺🇸</Text>
                  <Text className="text-foreground text-[17px] font-semibold">+1</Text>
                </View>
                <TextInput
                  className="flex-1 bg-card rounded-[14px] px-4 py-4 text-foreground text-[17px] border border-border"
                  placeholder="(555) 000-0000"
                  placeholderTextColor="#5D6279"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={14}
                />
              </View>
            </MotiView>
          )}

          {step === 'verify' && (
            <MotiView key="verify" from={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <PipCard expression="excited" message="Just sent you a code!" size="small" />
              <View className="flex-row justify-center mt-6 gap-4">
                {code.map((digit, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => { if (r) inputs.current[i] = r; }}
                    className={`w-[52px] h-[56px] bg-card rounded-[14px] text-center text-foreground text-2xl font-bold border-[1.5px] ${
                      activeIdx === i ? 'border-[#4A7BD9]' : digit ? 'border-[#4A7BD9]' : 'border-border'
                    }`}
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
              <Text className="text-muted-foreground text-center text-[13px] mt-4">Sent to {e164Phone}</Text>
              <TouchableOpacity onPress={() => { setStep('phone'); setCode(['', '', '', '']); }}>
                <Text className="text-[#6EC6B8] text-center text-sm mt-2">Wrong number? Go back</Text>
              </TouchableOpacity>
            </MotiView>
          )}

          {step === 'success' && (
            <MotiView
              key="success"
              from={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 10, stiffness: 100 }}
              className="items-center justify-center py-12"
            >
              <View className="w-16 h-16 rounded-full bg-[#34C759] justify-center items-center mb-4">
                <Ionicons name="checkmark" size={32} color="#FFFFFF" />
              </View>
              <Text className="text-foreground text-xl font-bold">Connected!</Text>
            </MotiView>
          )}
        </AnimatePresence>

        <View className="flex-1" />
      </KeyboardAvoidingView>
      {step !== 'success' && (
        <View className="px-6 pb-8">
          <GradientButton
            title={loading ? (step === 'phone' ? 'Sending...' : 'Verifying...') : (step === 'phone' ? 'Text Me' : 'Verify')}
            onPress={step === 'phone' ? handleSendCode : handleVerify}
            disabled={loading}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
