import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-[#0C0C0C]">
      <ProgressBar step={1} />
      <View className="flex-1 justify-center items-center px-6">
        <Text className="text-[24px] text-center mb-4">✨</Text>

        <PipCard expression="wave" size="large" />

        <View className="flex-row items-center gap-3 mt-4 mb-4">
          <Text className="text-[18px]">📱</Text>
          <Text className="text-[18px]">🤖</Text>
          <Text className="text-[18px]">🕊️</Text>
        </View>

        <View className="bg-[#1A1A1A] rounded-[20px] border border-[#2A2A2A] p-5 w-full">
          <Text
            className="text-white text-[22px] font-bold text-center"
            style={{ fontFamily: 'Sora_700Bold', letterSpacing: -0.5 }}
          >
            {"Hey! I'm Pip, your\npersonal AI pigeon!"}
          </Text>
          <Text
            className="text-[#8A8A8A] text-[14px] text-center mt-2"
            style={{ fontFamily: 'Inter_400Regular' }}
          >
            I automate your life through SMS — calendars, tasks, music, just text me.
          </Text>
        </View>
      </View>

      <View className="px-6 pb-8">
        <GradientButton
          title="Nice to meet you!"
          showArrow
          onPress={() => router.push('/onboarding/features')}
        />
      </View>
    </SafeAreaView>
  );
}
