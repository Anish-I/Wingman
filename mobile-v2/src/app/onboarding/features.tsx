import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';

const FEATURES = [
  { icon: 'calendar-outline' as const, title: 'Schedule meetings', bg: '#FF3B3020' },
  { icon: 'checkmark-circle-outline' as const, title: 'Manage tasks', bg: '#32D74B20' },
  { icon: 'musical-notes-outline' as const, title: 'Control music', bg: '#9B7EC820' },
  { icon: 'mail-outline' as const, title: 'Send emails', bg: '#3B599820' },
  { icon: 'bulb-outline' as const, title: 'Smart reminders', bg: '#F5A62320' },
];

export default function FeaturesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-[#0C0C0C]">
      <ProgressBar step={2} />
      <View className="flex-1 px-6">
        <PipCard expression="thumbsup" size="tiny" />

        <View className="mt-4">
          <SectionLabel text="WHAT I CAN DO" />
        </View>

        <Text
          className="text-white text-[30px] font-bold mt-3"
          style={{ fontFamily: 'Sora_700Bold', letterSpacing: -1.5 }}
        >
          Automate Everything
        </Text>
        <Text
          className="text-[#8A8A8A] text-[18px] font-bold mb-5"
          style={{ fontFamily: 'Sora_700Bold' }}
        >
          through SMS.
        </Text>

        <View className="gap-2.5">
          {FEATURES.map((feat, i) => (
            <MotiView
              key={i}
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 400, delay: i * 100 }}
            >
              <View className="h-[52px] rounded-xl bg-[#1A1A1A] px-[14px] flex-row items-center gap-3">
                <View
                  className="w-[34px] h-[34px] rounded-lg items-center justify-center"
                  style={{ backgroundColor: feat.bg }}
                >
                  <Ionicons name={feat.icon} size={18} color="#FFFFFF" />
                </View>
                <Text
                  className="text-white text-[14px] flex-1"
                  style={{ fontFamily: 'Inter_500Medium' }}
                >
                  {feat.title}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#FF3B30" />
              </View>
            </MotiView>
          ))}
        </View>
      </View>

      <View className="px-6 pb-8">
        <GradientButton
          title="Let's Go"
          onPress={() => router.push('/onboarding/signup')}
        />
      </View>
    </SafeAreaView>
  );
}
