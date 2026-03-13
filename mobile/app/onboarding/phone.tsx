import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';
import { api } from '../../src/api';

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      Alert.alert('Invalid number', 'Please enter a valid phone number.');
      return;
    }
    const e164 = `+1${cleaned.slice(-10)}`;
    setLoading(true);
    try {
      await api.auth.requestOtp(e164);
      router.push({ pathname: '/onboarding/verify', params: { phone: e164 } });
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to send code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <PipCard
          expression="thinking"
          message={"What's your number?\nI'll text you a code\nto verify it's you."}
        />
        <View style={styles.inputRow}>
          <Text style={styles.prefix}>+1</Text>
          <TextInput
            style={styles.input}
            placeholder="(555) 000-0000"
            placeholderTextColor="#555"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={14}
          />
        </View>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Sending\u2026' : 'Send code \u2192'}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginVertical: 24,
  },
  prefix: { color: '#e0e0ff', fontSize: 17, marginRight: 8 },
  input: {
    flex: 1,
    color: '#e0e0ff',
    fontSize: 17,
    paddingVertical: 16,
  },
  button: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
