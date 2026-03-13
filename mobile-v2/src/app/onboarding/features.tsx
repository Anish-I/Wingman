import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';

const FEATURES = [
  { icon: 'calendar-outline' as const, title: 'Schedule meetings', color: '#3B5998' },
  { icon: 'checkmark-circle-outline' as const, title: 'Manage tasks', color: '#34C759' },
  { icon: 'musical-notes-outline' as const, title: 'Control music', color: '#34C759' },
  { icon: 'mail-outline' as const, title: 'Send emails', color: '#F87171' },
  { icon: 'bulb-outline' as const, title: 'Smart reminders', color: '#F5A623' },
];

export default function FeaturesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ProgressBar step={2} />
      <ScrollView contentContainerClassName="px-6 pb-6">
        <PipCard expression="thumbsup" size="small" />
        <Text className="text-white text-[28px] font-extrabold text-center mt-4">
          Automate Everything
        </Text>
        <Text className="text-[#6EC6B8] text-xl font-bold text-center mb-6">
          through SMS
        </Text>
        <View className="gap-3">
          {FEATURES.map((feat, i) => (
            <MotiView
              key={i}
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 400, delay: i * 100 }}
            >
              <View className="flex-row items-center bg-card rounded-2xl p-4">
                <View
                  className="w-10 h-10 rounded-full justify-center items-center mr-4"
                  style={{ backgroundColor: feat.color }}
                >
                  <Ionicons name={feat.icon} size={22} color="#FFFFFF" />
                </View>
                <Text className="text-white text-base font-bold">{feat.title}</Text>
              </View>
            </MotiView>
          ))}
        </View>
      </ScrollView>
      <View className="px-6 pb-8">
        <GradientButton
          title="Let's Go"
          onPress={() => router.push('/onboarding/signup')}
        />
      </View>
    </SafeAreaView>
  );
}
