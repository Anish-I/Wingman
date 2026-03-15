import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';

const PERMISSIONS = [
  {
    icon: 'notifications-outline' as const,
    title: 'Notifications',
    subtitle: 'Get instant task updates',
    bg: '#3B599820',
  },
  {
    icon: 'people-outline' as const,
    title: 'Contacts',
    subtitle: 'Send messages to friends',
    bg: '#9B7EC820',
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Calendar',
    subtitle: 'Schedule and manage events',
    bg: '#3B599820',
  },
  {
    icon: 'location-outline' as const,
    title: 'Location',
    subtitle: 'Find nearby places & navigate',
    bg: '#6EC6B820',
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const [granted, setGranted] = useState<Record<number, boolean>>({});

  function handleAllow(index: number) {
    setGranted((prev) => ({ ...prev, [index]: true }));
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0C0C0C]">
      <ProgressBar step={4} />
      <View className="flex-1 px-6">
        {/* Pip speech bubble row */}
        <View className="flex-row items-center gap-3 mt-4">
          <PipCard expression="question" size="mini" />
          <View className="flex-1 bg-[#1A1A1A] rounded-xl border border-[#2A2A2A]" style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text
              className="text-white text-[13px]"
              style={{ fontFamily: 'Inter_500Medium' }}
            >
              I need a few permissions to help you out!
            </Text>
          </View>
        </View>

        <View className="mt-5">
          <SectionLabel text="PERMISSIONS" />
        </View>

        {/* Permission cards */}
        <View className="gap-2.5 mt-4">
          {PERMISSIONS.map((perm, i) => (
            <MotiView
              key={i}
              from={{ opacity: 0, translateY: 15 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 350, delay: i * 80 }}
            >
              <View className="rounded-xl bg-[#1A1A1A] flex-row items-center gap-3" style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
                <View
                  className="w-[38px] h-[38px] rounded-[10px] items-center justify-center"
                  style={{ backgroundColor: perm.bg }}
                >
                  <Ionicons name={perm.icon} size={20} color="#FFFFFF" />
                </View>
                <View className="flex-1" style={{ gap: 2 }}>
                  <Text
                    className="text-white text-[14px]"
                    style={{ fontFamily: 'Inter_600SemiBold' }}
                  >
                    {perm.title}
                  </Text>
                  <Text
                    className="text-[#8A8A8A] text-[12px]"
                    style={{ fontFamily: 'Inter_400Regular' }}
                  >
                    {perm.subtitle}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleAllow(i)}
                  activeOpacity={0.7}
                >
                  {granted[i] ? (
                    <MotiView
                      from={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring' }}
                      className="bg-[#32D74B] rounded px-3 py-1.5"
                    >
                      <Text
                        className="text-white text-[11px]"
                        style={{ fontFamily: 'Inter_600SemiBold' }}
                      >
                        Done
                      </Text>
                    </MotiView>
                  ) : (
                    <View className="bg-[#3B5998] rounded px-3 py-1.5">
                      <Text
                        className="text-white text-[11px]"
                        style={{ fontFamily: 'Inter_600SemiBold' }}
                      >
                        Allow
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </MotiView>
          ))}
        </View>
      </View>

      <View className="px-6 pb-8">
        <GradientButton
          title="Continue"
          onPress={() => router.push('/onboarding/phone')}
        />
      </View>
    </SafeAreaView>
  );
}
