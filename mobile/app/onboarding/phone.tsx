import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { api } from '../../src/api';
import { saveToken } from '../../src/auth';
import { registerForPushNotifications } from '../../src/notifications';
import { colors, spacing, radius } from '../../src/theme';

export default function PhoneScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const [phone, setPhone] = useState('');
  const [e164Phone, setE164Phone] = useState('');
  const [step, setStep] = useState<'phone' | 'verify'>('phone');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
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
      await api.auth.requestOtp(formatted);
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
    if (text && idx < 5) inputs.current[idx + 1]?.focus();
  }

  async function handleVerify() {
    const otp = code.join('');
    if (otp.length !== 6) {
      Alert.alert('Incomplete', 'Please enter all 6 digits.');
      return;
    }
    setLoading(true);
    try {
      const { token } = await api.auth.verifyOtp(e164Phone, otp);
      await saveToken(token);
      await registerForPushNotifications();
      router.push('/onboarding/connect');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={4} />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.spacer} />

        {step === 'phone' ? (
          <>
            <PipCard
              expression="thinking"
              message={"What's your number?\nI'll text you a code to verify."}
            />
            <View style={styles.inputRow}>
              <View style={styles.prefixBox}>
                <Text style={styles.prefix}>+1</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="(555) 000-0000"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={14}
              />
            </View>
          </>
        ) : (
          <>
            <PipCard
              expression="excited"
              message={"Check your texts!\nI sent a 6-digit code."}
            />
            <View style={styles.codeRow}>
              {code.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(r) => { if (r) inputs.current[i] = r; }}
                  style={[styles.codeBox, digit ? styles.codeBoxFilled : null]}
                  value={digit}
                  onChangeText={(t) => handleCodeChange(t, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>
            <Text style={styles.hint}>Sent to {e164Phone}</Text>
            <TouchableOpacity onPress={() => { setStep('phone'); setCode(['', '', '', '', '', '']); }}>
              <Text style={styles.resend}>Wrong number? Go back</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.spacer} />
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        <GradientButton
          title={loading ? (step === 'phone' ? 'Sending...' : 'Verifying...') : (step === 'phone' ? 'Send Code' : 'Verify')}
          onPress={step === 'phone' ? handleSendCode : handleVerify}
          disabled={loading}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  spacer: { flex: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  prefixBox: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  prefix: { color: colors.text, fontSize: 17, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    color: colors.text,
    fontSize: 17,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  codeBox: {
    flex: 1,
    height: 56,
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    textAlign: 'center',
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeBoxFilled: {
    borderColor: colors.primary,
  },
  hint: { color: colors.textMuted, textAlign: 'center', fontSize: 13, marginTop: spacing.md },
  resend: { color: colors.accent, textAlign: 'center', fontSize: 14, marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
