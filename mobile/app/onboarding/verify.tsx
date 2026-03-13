import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import PipCard from '../../src/PipCard';
import { api } from '../../src/api';
import { saveToken } from '../../src/auth';
import { registerForPushNotifications } from '../../src/notifications';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const inputs = useRef<TextInput[]>([]);

  function handleChange(text: string, idx: number) {
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
      const { token } = await api.auth.verifyOtp(phone, otp);
      await saveToken(token);
      await registerForPushNotifications();
      router.replace('/onboarding/connect');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <PipCard
          expression="thinking"
          message={"Check your texts \u2014\nI sent a 6-digit code!"}
        />
        <View style={styles.codeRow}>
          {code.map((digit, i) => (
            <TextInput
              key={i}
              ref={(r) => { if (r) inputs.current[i] = r; }}
              style={styles.codeBox}
              value={digit}
              onChangeText={(t) => handleChange(t, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Verifying\u2026' : 'Verify \u2192'}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Sent to {phone}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 24,
  },
  codeBox: {
    width: 48,
    height: 56,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    textAlign: 'center',
    color: '#e0e0ff',
    fontSize: 22,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  hint: { color: '#555', textAlign: 'center', fontSize: 13 },
});
