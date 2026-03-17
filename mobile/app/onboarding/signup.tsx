import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing } from '../../src/theme';

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={3} />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <PipCard expression="wave" size="small" />

          <Text style={styles.headline}>Join the Flock 🐦</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoComplete="given-name"
            />
          </View>

          <View style={styles.signinRow}>
            <Text style={styles.signinMuted}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/onboarding/phone')}>
              <Text style={styles.signinLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        <GradientButton
          title="Continue"
          onPress={() => router.push({ pathname: '/onboarding/phone', params: { name } })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  inputContainer: { marginBottom: spacing.sm },
  input: {
    backgroundColor: '#242540',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    color: '#FFFFFF',
    fontSize: 17,
    borderWidth: 1,
    borderColor: '#3A3B5C',
  },
  signinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  signinMuted: {
    color: colors.textMuted,
    fontSize: 14,
  },
  signinLink: {
    color: '#6EC6B8',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
