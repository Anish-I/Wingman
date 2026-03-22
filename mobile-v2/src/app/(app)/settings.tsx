import React from 'react';
import { View, Text, Pressable, ScrollView, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useRouter } from 'expo-router';
import PipCard from '@/components/wingman/pip-card';
import { signOut } from '@/features/auth/use-auth-store';
import { useProfile } from '@/features/settings/api';
import { useThemeColors } from '@/components/ui/tokens';
import { cardPressStyle, webInteractive, webHoverStyle, webFocusRing, useReducedMotion, maybeReduce } from '@/lib/motion';

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
  const { surface, text: t } = useThemeColors();
  const isInteractive = typeof onPress === 'function';
  const shouldShowChevron = showChevron && isInteractive;
  const containerStyle = [
    {
      backgroundColor: surface.section,
    },
    isFirst && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    isLast && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  ];
  const content = (
    <>
      <View
        className="w-9 h-9 rounded-xl justify-center items-center"
        style={{ backgroundColor: iconColor + '18' }}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text className="flex-1 text-[15px] font-semibold text-foreground">{label}</Text>
      <View className="flex-row items-center gap-1.5">
        {value ? (
          <View style={{ backgroundColor: surface.elevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: '600' }}>{value}</Text>
          </View>
        ) : null}
        {shouldShowChevron && <Ionicons name="chevron-forward" size={16} color={t.disabled} />}
      </View>
    </>
  );

  if (!isInteractive) {
    return (
      <>
        <View
          className="flex-row items-center py-4 px-4 gap-3"
          accessible
          accessibilityLabel={label}
          accessibilityHint={value ? `Current value: ${value}` : undefined}
          style={containerStyle}
        >
          {content}
        </View>
        {!isLast && <View style={{ height: 1, backgroundColor: surface.border, marginLeft: 56 }} />}
      </>
    );
  }

  return (
    <>
      <Pressable
        className="flex-row items-center py-4 px-4 gap-3"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={value ? `Current value: ${value}` : undefined}
        style={({ pressed, hovered, focused }: any) => [
          ...containerStyle,
          ...cardPressStyle({ pressed }),
          webInteractive(),
          // Web hover: subtle lift and background change
          Platform.OS === 'web' && hovered && !pressed
            ? { backgroundColor: surface.elevated, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' } as any
            : undefined,
          // Web focus ring
          Platform.OS === 'web' && focused
            ? { boxShadow: '0 0 0 2px rgba(124, 92, 252, 0.3)' } as any
            : undefined,
        ]}
        onPress={onPress}
      >
        {content}
      </Pressable>
      {!isLast && <View style={{ height: 1, backgroundColor: surface.border, marginLeft: 56 }} />}
    </>
  );
}

export default function SettingsScreen() {
  const { surface, text: t } = useThemeColors();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { data: profile } = useProfile();

  const displayName = profile?.name || profile?.phone || 'User';
  const displayPhone = profile?.phone ?? '—';
  const stats = profile?.stats ?? { apps: 0, workflows: 0, messages: 0 };

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
          {...maybeReduce({
            from: { opacity: 0, scale: 0.9 },
            animate: { opacity: 1, scale: 1 },
            transition: { type: 'spring' as const, damping: 12 },
          }, reducedMotion)}
          className="items-center pt-6 pb-4"
        >
          <PipCard expression="happy" size="medium" className="mb-0" />
          <Text className="text-foreground text-xl font-extrabold mt-2">{displayName}</Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            <View className="w-2 h-2 rounded-full bg-[#32D74B]" />
            <Text className="text-[#32D74B] text-xs font-semibold">Active</Text>
          </View>
        </MotiView>

        {/* Stats row */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, translateY: 10 },
            animate: { opacity: 1, translateY: 0 },
            transition: { delay: 200 },
          }, reducedMotion)}
          className="flex-row gap-3 px-4 mb-6"
        >
          {[
            { num: String(stats.apps), label: 'Apps', color: '#6B9BEF' },
            { num: String(stats.workflows), label: 'Workflows', color: '#9B7EC8' },
            { num: String(stats.messages), label: 'Messages', color: '#6EC6B8' },
          ].map((stat, i) => (
            <MotiView
              key={stat.label}
              {...maybeReduce({
                from: { opacity: 0, scale: 0.8 },
                animate: { opacity: 1, scale: 1 },
                transition: { type: 'spring' as const, damping: 12, delay: 300 + i * 80 },
              }, reducedMotion)}
              className="flex-1 rounded-2xl py-3 items-center"
              style={{ backgroundColor: surface.section, borderWidth: 1, borderColor: surface.border }}
            >
              <Text style={{ color: stat.color, fontSize: 22, fontWeight: '800' }}>{stat.num}</Text>
              <Text style={{ color: t.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginTop: 2 }}>{stat.label}</Text>
            </MotiView>
          ))}
        </MotiView>

        {/* Account section */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, translateX: -15 },
            animate: { opacity: 1, translateX: 0 },
            transition: { delay: 400 },
          }, reducedMotion)}
          className="mt-2 px-4"
        >
          <Text className="text-[11px] font-bold uppercase tracking-widest mb-2 ml-1" style={{ color: t.muted }}>Account</Text>
          <View className="rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: surface.border }}>
            <SettingsRow icon="person-outline" iconColor="#6EC6B8" label="Profile" isFirst />
            <SettingsRow icon="call-outline" iconColor="#F5A623" label="Phone Number" value={displayPhone} showChevron={false} />
            <SettingsRow icon="apps-outline" iconColor="#6B9BEF" label="Connected Apps" value={`${stats.apps} apps`} onPress={() => router.push('/apps')} isLast />
          </View>
        </MotiView>

        {/* Preferences section */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, translateX: -15 },
            animate: { opacity: 1, translateX: 0 },
            transition: { delay: 500 },
          }, reducedMotion)}
          className="mt-6 px-4"
        >
          <Text className="text-[11px] font-bold uppercase tracking-widest mb-2 ml-1" style={{ color: t.muted }}>Preferences</Text>
          <View className="rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: surface.border }}>
            <SettingsRow icon="notifications-outline" iconColor="#F5A623" label="Notifications" isFirst />
            <SettingsRow icon="moon-outline" iconColor="#9B7EC8" label="Theme" value="Dark" />
            <SettingsRow icon="language-outline" iconColor="#6B9BEF" label="Language" value="English" isLast />
          </View>
        </MotiView>

        {/* About section */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, translateX: -15 },
            animate: { opacity: 1, translateX: 0 },
            transition: { delay: 600 },
          }, reducedMotion)}
          className="mt-6 px-4"
        >
          <Text className="text-[11px] font-bold uppercase tracking-widest mb-2 ml-1" style={{ color: t.muted }}>About</Text>
          <View className="rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: surface.border }}>
            <SettingsRow icon="information-circle-outline" iconColor="#6B9BEF" label="Version" value="1.0.0" showChevron={false} isFirst />
            <SettingsRow icon="shield-outline" iconColor="#6EC6B8" label="Privacy" />
            <SettingsRow icon="document-text-outline" iconColor="#8A8A8A" label="Terms" isLast />
          </View>
        </MotiView>

        {/* Logout */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { delay: 700 },
          }, reducedMotion)}
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
