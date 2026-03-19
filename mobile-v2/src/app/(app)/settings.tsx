import React from 'react';
import { View, Text, Pressable, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import { signOut } from '@/features/auth/use-auth-store';
import { cardPressStyle, webInteractive, webHoverStyle, webFocusRing } from '@/lib/motion';

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

function SettingsRow({ icon, iconColor = '#8A8A8A', label, value, onPress, showChevron = true, isFirst, isLast }: SettingsRowProps) {
  return (
    <>
      <Pressable
        className="flex-row items-center py-4 px-4 gap-3"
        style={({ pressed, hovered, focused }: any) => [
          {
            backgroundColor: '#1A1A1A',
          },
          isFirst && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
          isLast && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
          ...cardPressStyle({ pressed }),
          webInteractive(!onPress),
          // Web hover: subtle lift and background change
          Platform.OS === 'web' && hovered && !pressed && onPress
            ? { backgroundColor: '#232329', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' } as any
            : undefined,
          // Web focus ring
          Platform.OS === 'web' && focused && onPress
            ? { boxShadow: '0 0 0 2px rgba(124, 92, 252, 0.3)' } as any
            : undefined,
        ]}
        onPress={onPress}
        disabled={!onPress}
      >
        <View
          className="w-9 h-9 rounded-xl justify-center items-center"
          style={{ backgroundColor: iconColor + '18' }}
        >
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text className="flex-1 text-[15px] font-semibold text-foreground">{label}</Text>
        <View className="flex-row items-center gap-1.5">
          {value ? (
            <View className="bg-[#242424] rounded-lg px-2.5 py-1">
              <Text className="text-[#8A8A8A] text-[12px] font-semibold">{value}</Text>
            </View>
          ) : null}
          {showChevron && <Ionicons name="chevron-forward" size={16} color="#3A3A3A" />}
        </View>
      </Pressable>
      {!isLast && <View className="h-px bg-[#242424] ml-14" />}
    </>
  );
}

export default function SettingsScreen() {
  function handleLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('Log out\n\nAre you sure?')) {
        signOut();
      }
      return;
    }
    Alert.alert('Log out', 'Are you sure you want to leave Pip?', [
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
        {/* Profile header */}
        <MotiView
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 12 }}
          className="items-center pt-6 pb-4"
        >
          <PipCard expression="happy" size="medium" className="mb-0" />
          <Text className="text-foreground text-xl font-extrabold mt-2">Pip User</Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            <View className="w-2 h-2 rounded-full bg-[#32D74B]" />
            <Text className="text-[#32D74B] text-xs font-semibold">Active</Text>
          </View>
        </MotiView>

        {/* Stats row */}
        <MotiView
          from={{ opacity: 0, translateY: 10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ delay: 200 }}
          className="flex-row gap-3 px-4 mb-6"
        >
          {[
            { num: '0', label: 'Apps', color: '#4A7BD9' },
            { num: '0', label: 'Workflows', color: '#9B7EC8' },
            { num: '0', label: 'Messages', color: '#6EC6B8' },
          ].map((stat, i) => (
            <MotiView
              key={stat.label}
              from={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 12, delay: 300 + i * 80 }}
              className="flex-1 bg-[#1A1A1A] rounded-2xl py-3 items-center border border-[#2A2A2A]"
            >
              <Text style={{ color: stat.color, fontSize: 22, fontWeight: '800' }}>{stat.num}</Text>
              <Text className="text-[#8A8A8A] text-[10px] font-bold uppercase mt-0.5">{stat.label}</Text>
            </MotiView>
          ))}
        </MotiView>

        {/* Account section */}
        <MotiView
          from={{ opacity: 0, translateX: -15 }}
          animate={{ opacity: 1, translateX: 0 }}
          transition={{ delay: 400 }}
          className="mt-2 px-4"
        >
          <Text className="text-[#525252] text-[11px] font-bold uppercase tracking-widest mb-2 ml-1">Account</Text>
          <View className="rounded-2xl overflow-hidden border border-[#2A2A2A]">
            <SettingsRow icon="person-outline" iconColor="#6EC6B8" label="Profile" isFirst />
            <SettingsRow icon="call-outline" iconColor="#F5A623" label="Phone Number" />
            <SettingsRow icon="apps-outline" iconColor="#4A7BD9" label="Connected Apps" value="0 apps" isLast />
          </View>
        </MotiView>

        {/* Preferences section */}
        <MotiView
          from={{ opacity: 0, translateX: -15 }}
          animate={{ opacity: 1, translateX: 0 }}
          transition={{ delay: 500 }}
          className="mt-6 px-4"
        >
          <Text className="text-[#525252] text-[11px] font-bold uppercase tracking-widest mb-2 ml-1">Preferences</Text>
          <View className="rounded-2xl overflow-hidden border border-[#2A2A2A]">
            <SettingsRow icon="notifications-outline" iconColor="#F5A623" label="Notifications" isFirst />
            <SettingsRow icon="moon-outline" iconColor="#9B7EC8" label="Theme" value="Dark" />
            <SettingsRow icon="language-outline" iconColor="#4A7BD9" label="Language" value="English" isLast />
          </View>
        </MotiView>

        {/* About section */}
        <MotiView
          from={{ opacity: 0, translateX: -15 }}
          animate={{ opacity: 1, translateX: 0 }}
          transition={{ delay: 600 }}
          className="mt-6 px-4"
        >
          <Text className="text-[#525252] text-[11px] font-bold uppercase tracking-widest mb-2 ml-1">About</Text>
          <View className="rounded-2xl overflow-hidden border border-[#2A2A2A]">
            <SettingsRow icon="information-circle-outline" iconColor="#4A7BD9" label="Version" value="1.0.0" showChevron={false} isFirst />
            <SettingsRow icon="shield-outline" iconColor="#6EC6B8" label="Privacy" />
            <SettingsRow icon="document-text-outline" iconColor="#8A8A8A" label="Terms" isLast />
          </View>
        </MotiView>

        {/* Logout */}
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 700 }}
        >
          <Pressable
            className="flex-row items-center justify-center gap-2 py-4 mt-8 mx-4 bg-[#FF3B30]/10 rounded-2xl"
            onPress={handleLogout}
            style={({ pressed, hovered, focused }: any) => [
              ...cardPressStyle({ pressed }),
              webInteractive(),
              // Web hover: enhance background
              Platform.OS === 'web' && hovered && !pressed
                ? { backgroundColor: '#FF3B30/20', boxShadow: '0 2px 8px rgba(255, 59, 48, 0.2)' } as any
                : undefined,
              Platform.OS === 'web' && focused
                ? { boxShadow: '0 0 0 2px rgba(255, 59, 48, 0.3)' } as any
                : undefined,
            ]}
          >
            <Ionicons name="log-out-outline" size={18} color="#FF3B30" />
            <Text className="text-[#FF3B30] text-base font-bold">Log Out</Text>
          </Pressable>
        </MotiView>
      </ScrollView>
    </SafeAreaView>
  );
}
