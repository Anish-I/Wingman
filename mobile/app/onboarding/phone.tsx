import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { api } from '../../src/api';
import { saveToken } from '../../src/auth';
import { registerForPushNotifications } from '../../src/notifications';
import { colors, spacing, radius } from '../../src/theme';

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [e164Phone, setE164Phone] = useState('');
  const [step, setStep] = useState<'phone' | 'verify' | 'success'>('phone');
  const [code, setCode] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputs = useRef<TextInput[]>([]);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

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
      const { token } = await api.auth.verifyOtp(e164Phone, otp);
      await saveToken(token);
      await registerForPushNotifications();
      // Show success state
      setStep('success');
      Animated.parallel([
        Animated.spring(successScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 12,
          bounciness: 8,
        }),
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      // Auto-advance after delay
      setTimeout(() => {
        router.push('/onboarding/connect');
      }, 1500);
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-verify when all 4 digits entered
  useEffect(() => {
    if (code.every(d => d !== '') && step === 'verify') {
      handleVerify();
    }
  }, [code]);

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
              message="What is your number? I will text you to confirm!"
              size="small"
            />
            <View style={styles.inputRow}>
              <View style={styles.prefixBox}>
                <Text style={styles.flagEmoji}>🇺🇸</Text>
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
        ) : step === 'verify' ? (
          <>
            <PipCard
              expression="excited"
              message="Just sent you a code!"
              size="small"
            />
            <View style={styles.codeRow}>
              {code.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(r) => { if (r) inputs.current[i] = r; }}
                  style={[
                    styles.codeBox,
                    activeIdx === i && styles.codeBoxActive,
                    digit ? styles.codeBoxFilled : null,
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
            <Text style={styles.hint}>Sent to {e164Phone}</Text>
            <TouchableOpacity onPress={() => { setStep('phone'); setCode(['', '', '', '']); }}>
              <Text style={styles.resend}>Wrong number? Go back</Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.successContainer}>
            <Animated.View
              style={[
                styles.successCircle,
                {
                  transform: [{ scale: successScale }],
                  opacity: successOpacity,
                },
              ]}
            >
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            </Animated.View>
            <Animated.Text style={[styles.successText, { opacity: successOpacity }]}>
              Connected!
            </Animated.Text>
          </View>
        )}

        <View style={styles.spacer} />
      </KeyboardAvoidingView>
      {step !== 'success' && (
        <View style={styles.footer}>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  flagEmoji: { fontSize: 20 },
  prefix: { color: colors.text, fontSize: 17, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    backgroundColor: colors.card,
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
    justifyContent: 'center',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  codeBox: {
    width: 52,
    height: 56,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    textAlign: 'center',
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  codeBoxActive: {
    borderColor: colors.primaryLight,
    shadowColor: colors.primaryLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  codeBoxFilled: {
    borderColor: colors.primaryLight,
  },
  hint: { color: colors.textMuted, textAlign: 'center', fontSize: 13, marginTop: spacing.md },
  resend: { color: colors.accent, textAlign: 'center', fontSize: 14, marginTop: spacing.sm },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  successText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
