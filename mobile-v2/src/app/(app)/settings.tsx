import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '@/components/wingman/pip-card';
import { signOut } from '@/features/auth/use-auth-store';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingsRowProps {
  icon: IconName;
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

function SettingsRow({ icon, iconColor = '#9A9BBF', label, value, onPress, showChevron = true, isFirst, isLast }: SettingsRowProps) {
  return (
    <>
      <TouchableOpacity
        className="flex-row items-center py-3.5 px-4 gap-3 bg-card"
        style={[
          isFirst && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
          isLast && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
        ]}
        onPress={onPress}
        activeOpacity={onPress ? 0.6 : 1}
        disabled={!onPress}
      >
        <View
          className="w-8 h-8 rounded-full justify-center items-center"
          style={{ backgroundColor: iconColor + '20' }}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text className="flex-1 text-[15px] font-medium text-foreground">{label}</Text>
        <View className="flex-row items-center gap-1.5">
          {value ? <Text className="text-muted-foreground text-sm">{value}</Text> : null}
          {showChevron && <Ionicons name="chevron-forward" size={16} color="#5D6279" />}
        </View>
      </TouchableOpacity>
      {!isLast && <View className="h-px bg-[#2E2F4D] ml-14" />}
    </>
  );
}

export default function SettingsScreen() {
  function handleLogout() {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="pb-12">
        <View className="items-center pt-4 pb-2">
          <PipCard expression="wave" size="medium" className="mb-0" />
          <Text className="text-foreground text-lg font-bold mt-1">Pip User</Text>
        </View>

        <View className="mt-6 px-4">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Account</Text>
          <View className="bg-card rounded-2xl overflow-hidden">
            <SettingsRow icon="person-outline" iconColor="#6EC6B8" label="Profile" isFirst />
            <SettingsRow icon="call-outline" iconColor="#F5A623" label="Phone Number" />
            <SettingsRow icon="apps-outline" iconColor="#4A7BD9" label="Connected Apps" value="0 apps" isLast />
          </View>
        </View>

        <View className="mt-6 px-4">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2 ml-1">Preferences</Text>
          <View className="bg-card rounded-2xl overflow-hidden">
            <SettingsRow icon="notifications-outline" iconColor="#F5A623" label="Notifications" isFirst />
            <SettingsRow icon="moon-outline" iconColor="#9B7EC8" label="Theme" value="Dark" />
            <SettingsRow icon="language-outline" iconColor="#4A7BD9" label="Language" value="English" isLast />
          </View>
        </View>

        <View className="mt-6 px-4">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-2 ml-1">About</Text>
          <View className="bg-card rounded-2xl overflow-hidden">
            <SettingsRow icon="information-circle-outline" iconColor="#4A7BD9" label="Version" value="1.0.0" showChevron={false} isFirst />
            <SettingsRow icon="shield-outline" iconColor="#6EC6B8" label="Privacy" />
            <SettingsRow icon="document-text-outline" iconColor="#9A9BBF" label="Terms" isLast />
          </View>
        </View>

        <TouchableOpacity className="items-center py-4 mt-8 mx-4" onPress={handleLogout} activeOpacity={0.6}>
          <Text className="text-[#F87171] text-base font-semibold">Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
