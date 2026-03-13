import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius } from '../../src/theme';

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
        <View style={styles.spacer} />
        <PipCard
          expression="thinking"
          message="What should I call you?"
        />
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Your name (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Alex"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="given-name"
          />
        </View>
        <View style={styles.spacer} />
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
  content: { flex: 1, paddingHorizontal: spacing.lg },
  spacer: { flex: 1 },
  inputContainer: { marginTop: spacing.lg },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm, marginLeft: 4 },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 16,
    color: colors.text,
    fontSize: 17,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
