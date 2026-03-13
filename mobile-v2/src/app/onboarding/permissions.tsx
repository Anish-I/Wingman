import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';

interface PermissionCardProps {
  emoji: string;
  emojiBg: string;
  title: string;
  subtitle: string;
  granted: boolean;
  onPress: () => void;
}

function PermissionCard({ emoji, emojiBg, title, subtitle, granted, onPress }: PermissionCardProps) {
  return (
    <View className="flex-row items-center bg-card rounded-2xl p-4 border border-border">
      <View className="w-10 h-10 rounded-full justify-center items-center mr-4" style={{ backgroundColor: emojiBg }}>
        <Text className="text-lg">{emoji}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-foreground text-base font-bold mb-0.5">{title}</Text>
        <Text className="text-muted-foreground text-[13px]">{subtitle}</Text>
      </View>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {granted ? (
          <MotiView
            from={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring' }}
            className="flex-row items-center gap-1 px-4 py-2 rounded-full bg-[#34C759]"
          >
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            <Text className="text-white text-[13px] font-semibold">Done</Text>
          </MotiView>
        ) : (
          <LinearGradient
            colors={['#4A7BD9', '#3B5998', '#2D4474']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999 }}
          >
            <Text className="text-white text-[13px] font-semibold">Allow</Text>
          </LinearGradient>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function PermissionsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState(false);
  const [contacts, setContacts] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [location, setLocation] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ProgressBar step={4} />
      <View className="flex-1 px-6">
        <View className="flex-1" />
        <PipCard expression="love" message="I need a few permissions to help you out!" size="small" />
        <View className="mt-6 gap-3">
          <PermissionCard emoji="🔔" emojiBg="#F5A623" title="Notifications" subtitle="So I can ping you" granted={notifications} onPress={() => setNotifications(true)} />
          <PermissionCard emoji="👥" emojiBg="#4A7BD9" title="Contacts" subtitle="To manage your people" granted={contacts} onPress={() => setContacts(true)} />
          <PermissionCard emoji="📅" emojiBg="#6EC6B8" title="Calendar" subtitle="To schedule your life" granted={calendar} onPress={() => setCalendar(true)} />
          <PermissionCard emoji="📍" emojiBg="#E74C3C" title="Location" subtitle="For recommendations" granted={location} onPress={() => setLocation(true)} />
        </View>
        <View className="flex-1" />
      </View>
      <View className="px-6 pb-8">
        <GradientButton title="Continue" onPress={() => router.push('/onboarding/done')} />
      </View>
    </SafeAreaView>
  );
}
