import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';
import { signIn } from '@/features/auth/use-auth-store';

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
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#000000">
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  function handleSignUp() {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    signIn('demo-mock-token');
    router.push('/onboarding/permissions');
  }

  function handleGoogleSignIn() {
    Alert.alert('Demo Mode', 'OAuth is not available in demo mode. Use email sign-up instead.');
  }

  function handleAppleSignIn() {
    Alert.alert('Demo Mode', 'OAuth is not available in demo mode. Use email sign-up instead.');
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0C0C0C]">
      <ProgressBar step={3} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerClassName="px-6 pb-8 items-center" keyboardShouldPersistTaps="handled">
          <PipCard expression="excited" size="small" />

          <View className="mt-4 mb-2 self-center">
            <SectionLabel text="JOIN THE FLOCK" />
          </View>

          <Text
            className="text-white text-[28px] font-bold text-center mb-5"
            style={{ fontFamily: 'Sora_700Bold', letterSpacing: -1 }}
          >
            {"Create Your\nAccount"}
          </Text>

          {/* Form */}
          <View className="gap-3 w-full">
            {/* Email input */}
            <View className="h-[52px] rounded-lg bg-[#1A1A1A] border border-[#3A3A3A] px-4 flex-row items-center">
              <Ionicons name="mail-outline" size={18} color="#525252" />
              <TextInput
                className="flex-1 ml-3 text-white text-[14px]"
                placeholder="Email address"
                placeholderTextColor="#525252"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
            </View>

            {/* Password input */}
            <View className="h-[52px] rounded-lg bg-[#1A1A1A] border border-[#3A3A3A] px-4 flex-row items-center">
              <Ionicons name="lock-closed-outline" size={18} color="#525252" />
              <TextInput
                className="flex-1 ml-3 text-white text-[14px]"
                placeholder="Password"
                placeholderTextColor="#525252"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="#525252" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="mt-4 w-full">
            <GradientButton title="Sign Up" onPress={handleSignUp} />
          </View>

          {/* Divider */}
          <View className="flex-row items-center my-5 w-full">
            <View className="flex-1 h-px bg-[#2A2A2A]" />
            <Text
              className="text-[#525252] text-[13px] mx-4"
              style={{ fontFamily: 'Inter_500Medium' }}
            >
              or continue with
            </Text>
            <View className="flex-1 h-px bg-[#2A2A2A]" />
          </View>

          {/* Social buttons */}
          <View className="gap-2.5 w-full">
            <TouchableOpacity
              className="h-[52px] rounded-lg border-[1.5px] border-[#3A3A3A] flex-row items-center justify-center"
              onPress={handleGoogleSignIn}
              activeOpacity={0.8}
            >
              <GoogleIcon />
              <Text
                className="text-white text-[14px] ml-2.5"
                style={{ fontFamily: 'Inter_500Medium' }}
              >
                Continue with Google
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="h-[52px] rounded-lg bg-white flex-row items-center justify-center"
              onPress={handleAppleSignIn}
              activeOpacity={0.8}
            >
              <AppleIcon />
              <Text
                className="text-black text-[14px] ml-2.5"
                style={{ fontFamily: 'Inter_500Medium' }}
              >
                Continue with Apple
              </Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View className="flex-row justify-center items-center mt-5 mb-4">
            <Text
              className="text-[#525252] text-[13px]"
              style={{ fontFamily: 'Inter_400Regular' }}
            >
              Already have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <Text
                className="text-[#525252] text-[13px] font-semibold"
                style={{ fontFamily: 'Inter_400Regular' }}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
