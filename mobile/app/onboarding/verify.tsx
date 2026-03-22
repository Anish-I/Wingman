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
  Pressable,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { saveToken } from '../../src/auth';
import { registerForPushNotifications } from '../../src/notifications';
import { colors, spacing, radius } from '../../src/theme';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputs = useRef<TextInput[]>([]);
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const entryOpacity = useRef(new Animated.Value(0)).current;
  const entryTranslate = useRef(new Animated.Value(18)).current;
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entryOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(entryTranslate, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [entryOpacity, entryTranslate]);

  function handleCodeChange(text: string, idx: number) {
    const newCode = [...code];
    newCode[idx] = text.slice(-1);
    setCode(newCode);
    if (text && idx < code.length - 1) {
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
    if (!phone) {
      Alert.alert('Error', 'Phone number missing.');
      return;
    }
    setLoading(true);
    try {
      const { token } = await api.auth.verifyOtp(phone, otp);
      if (!token) {
        throw new Error('No authentication token returned.');
      }
      await saveToken(token);
    } catch (err: unknown) {
      setLoading(false);
      Alert.alert('Verification Failed', err instanceof Error ? err.message : 'Failed to verify code. Please try again.');
      setCode(['', '', '', '', '', '']);
      setActiveIdx(0);
      inputs.current[0]?.focus();
      return;
    }
    try { await registerForPushNotifications(); } catch {}
    setVerified(true);
    setLoading(false);
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
    setTimeout(() => {
      router.replace('/onboarding/connect');
    }, 1500);
  }

  useEffect(() => {
    if (code.every((d) => d !== '') && !verified) {
      handleVerify();
    }
  }, [code, verified]);

  async function handleResend() {
    if (!phone) return;
    try {
      await api.auth.requestOtp(phone);
      Alert.alert('Sent', 'A new code has been sent.');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to resend.');
    }
  }

  if (verified) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Animated.View
            style={[
              styles.successCircle,
              { transform: [{ scale: successScale }], opacity: successOpacity },
            ]}
          >
            <Ionicons name="checkmark" size={32} color="#FFFFFF" />
          </Animated.View>
          <Animated.Text style={[styles.successText, { opacity: successOpacity }]}>
            Verified!
          </Animated.Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={{ flex: 1, opacity: entryOpacity, transform: [{ translateY: entryTranslate }] }}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={styles.title}>Check your texts</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to {phone || 'your phone'}
          </Text>

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

          <TouchableOpacity onPress={handleResend} style={styles.resendBtn}>
            <Text style={styles.resendText}>Didn't get a code? Resend</Text>
          </TouchableOpacity>

          <View style={styles.spacer} />
        </KeyboardAvoidingView>

        <View style={styles.footer}>
          <Pressable
            style={(state: any) => [
              styles.verifyBtn,
              (loading || code.some((d) => d === '')) && styles.verifyBtnDisabled,
              state.hovered && styles.verifyBtnHover,
              state.focused && styles.verifyBtnFocus,
              state.pressed && styles.verifyBtnPressed,
            ]}
            onPress={handleVerify}
            disabled={loading || code.some((d) => d === '')}
          >
            <Text style={styles.verifyBtnText}>{loading ? 'Verifying...' : 'Verify'}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  backBtn: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: spacing.xl,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  codeBox: {
    width: 48,
    height: 64,
    backgroundColor: colors.card,
    borderRadius: radius.button,
    textAlign: 'center',
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  codeBoxActive: {
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  codeBoxFilled: {
    borderColor: colors.primary,
  },
  resendBtn: {
    marginTop: spacing.lg,
    alignSelf: 'center',
  },
  resendText: {
    color: '#8888aa',
    fontSize: 14,
    fontWeight: '500',
  },
  spacer: { flex: 1 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  verifyBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyBtnDisabled: {
    opacity: 0.5,
  },
  verifyBtnHover: {
    opacity: 0.92,
  },
  verifyBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  verifyBtnFocus: {
    borderWidth: 2,
    borderColor: colors.teal,
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
});
