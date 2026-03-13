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
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius } from '../../src/theme';
import { api } from '../../src/api';
import { saveToken } from '../../src/auth';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '45207370205-jsis6robv7mbejpakckiqgaono8s81hu.apps.googleusercontent.com';

const discovery = AuthSession.useAutoDiscovery
  ? undefined
  : {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    };

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'wingman' });

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const authRequest = new AuthSession.AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['openid', 'profile', 'email'],
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true,
      });

      const result = await authRequest.promptAsync(
        discovery ?? {
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
        }
      );

      if (result.type === 'success' && result.params?.code) {
        // Exchange code for tokens via our backend
        const { token } = await api.auth.google(result.params.code);
        await saveToken(token);
        router.replace('/(tabs)/chat');
      } else if (result.type === 'cancel') {
        // User cancelled, do nothing
      } else {
        Alert.alert('Sign in failed', 'Could not complete Google sign-in.');
      }
    } catch (err: unknown) {
      Alert.alert(
        'Error',
        err instanceof Error ? err.message : 'Google sign-in failed.'
      );
    } finally {
      setGoogleLoading(false);
    }
  }

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

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleBtn, googleLoading && { opacity: 0.6 }]}
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
          activeOpacity={0.8}
        >
          {googleLoading ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

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
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 13,
    marginHorizontal: spacing.md,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  googleIcon: {
    color: '#4285F4',
    fontSize: 20,
    fontWeight: '700',
  },
  googleText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
