import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import { signIn } from '@/features/auth/use-auth-store';
import { client } from '@/lib/api/client';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '45207370205-jsis6robv7mbejpakckiqgaono8s81hu.apps.googleusercontent.com';

function GoogleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

function AppleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'wingman' });

  function handleSignUp() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    router.push({ pathname: '/onboarding/phone', params: { email } });
  }

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

      const result = await authRequest.promptAsync({
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      } as AuthSession.DiscoveryDocument);

      if (result.type === 'success' && result.params?.code) {
        const { data } = await client.post('/auth/google', { idToken: result.params.code });
        signIn(data.token);
        router.replace('/(app)');
      }
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ProgressBar step={3} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="px-6 pb-8" keyboardShouldPersistTaps="handled">
          <PipCard expression="wave" size="small" />
          <Text className="text-white text-[26px] font-extrabold text-center mt-4 mb-6">
            Join the Flock 🐦
          </Text>

          <View className="mb-2">
            <View className="flex-row items-center bg-card rounded-[14px] border border-border">
              <Ionicons name="mail-outline" size={20} color="#5D6279" style={{ paddingLeft: 16 }} />
              <TextInput
                className="flex-1 px-2 py-4 text-white text-[17px]"
                placeholder="Email address"
                placeholderTextColor="#5D6279"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View className="mb-2">
            <View className="flex-row items-center bg-card rounded-[14px] border border-border">
              <Ionicons name="lock-closed-outline" size={20} color="#5D6279" style={{ paddingLeft: 16 }} />
              <TextInput
                className="flex-1 px-2 py-4 text-white text-[17px]"
                placeholder="Password"
                placeholderTextColor="#5D6279"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>
          </View>

          <View className="mt-2">
            <GradientButton title="Sign Up" onPress={handleSignUp} />
          </View>

          <View className="flex-row items-center my-6 px-4">
            <View className="flex-1 h-px bg-border" />
            <Text className="text-muted-foreground text-[13px] mx-4">or</Text>
            <View className="flex-1 h-px bg-border" />
          </View>

          <TouchableOpacity
            className="flex-row items-center justify-center bg-white rounded-[14px] py-3.5 mb-3"
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
            activeOpacity={0.8}
            style={googleLoading ? { opacity: 0.6 } : undefined}
          >
            {googleLoading ? (
              <ActivityIndicator color="#1A1B2E" size="small" />
            ) : (
              <>
                <GoogleIcon />
                <Text className="text-[#1A1B2E] text-base font-semibold ml-2.5">Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity className="flex-row items-center justify-center bg-black rounded-[14px] py-3.5 mb-6" activeOpacity={0.8}>
            <AppleIcon />
            <Text className="text-white text-base font-semibold ml-2.5">Continue with Apple</Text>
          </TouchableOpacity>

          <View className="flex-row justify-center items-center mb-4">
            <Text className="text-muted-foreground text-sm">Already have an account? </Text>
            <TouchableOpacity>
              <Text className="text-[#6EC6B8] text-sm font-semibold">Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
