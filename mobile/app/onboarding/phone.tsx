import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { colors, spacing, radius } from '../../src/theme';

export default function PhoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const [phone, setPhone] = useState(params.phone ?? '');
  const [loading, setLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  async function handleSendCode() {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      setPhoneError('Please enter a valid 10-digit phone number');
      return;
    }
    setPhoneError('');
    const formatted = `+1${cleaned.slice(-10)}`;
    setLoading(true);
    try {
      await api.auth.requestOtp(formatted);
    } catch {
      // Backend unavailable — continue to verify screen anyway (demo mode)
    }
    setLoading(false);
    router.push({ pathname: '/onboarding/verify', params: { phone: formatted } });
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.title}>Enter your number</Text>
        <Text style={styles.subtitle}>We'll send you a verification code</Text>

        <View style={styles.inputCard}>
          <View style={styles.inputRow}>
            <View style={styles.prefixBox}>
              <Text style={styles.flagEmoji}>🇺🇸</Text>
              <Text style={styles.prefix}>+1</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </View>
            <TextInput
              style={styles.phoneInput}
              placeholder="(555) 000-0000"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(t) => { setPhone(t); if (phoneError) setPhoneError(''); }}
              maxLength={14}
            />
          </View>
        </View>
        {phoneError ? <Text style={styles.error}>{phoneError}</Text> : null}

        <View style={styles.spacer} />
      </KeyboardAvoidingView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.sendCodeBtn, (loading || phone.replace(/\D/g, '').length < 10) && styles.sendCodeBtnDisabled]}
          onPress={handleSendCode}
          disabled={loading || phone.replace(/\D/g, '').length < 10}
          activeOpacity={0.85}
        >
          <Text style={styles.sendCodeBtnText}>{loading ? 'Sending...' : 'Send Code'}</Text>
        </TouchableOpacity>
      </View>
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
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: spacing.xl,
  },
  inputCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  prefixBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  flagEmoji: { fontSize: 20 },
  prefix: { color: colors.text, fontSize: 17, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    paddingVertical: 4,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.sm,
    marginLeft: 4,
  },
  spacer: { flex: 1 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sendCodeBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendCodeBtnDisabled: {
    opacity: 0.5,
  },
  sendCodeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
