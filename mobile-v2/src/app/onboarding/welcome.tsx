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
    <SafeAreaView className="flex-1 bg-background">
      <ProgressBar step={1} />
      <View className="flex-1 justify-center px-6 items-center">
        <View className="flex-1" />
        <PipCard expression="wave" size="large" />
        <View className="bg-white rounded-[20px] p-5 mt-4 mx-2 shadow-md">
          <Text className="text-[#1A1B2E] text-[17px] font-bold text-center mb-2">
            Hey! I'm Pip, your personal AI pigeon!
          </Text>
          <Text className="text-[#1A1B2E] text-[15px] leading-[22px] text-center opacity-80">
            I automate your life through SMS. Calendars, tasks, music — just text me.
          </Text>
        </View>
        <View className="flex-1" />
      </View>
      <View className="px-6 pb-8">
        <GradientButton
          title="Nice to meet you!"
          onPress={() => router.push('/onboarding/features')}
        />
      </View>
    </SafeAreaView>
  );
}
