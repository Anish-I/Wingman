import React from 'react';
import { View, Text, Pressable, ScrollView, Alert, Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useRouter } from 'expo-router';
import PipCard from '@/components/wingman/pip-card';
import { signOut } from '@/features/auth/use-auth-store';
import { useProfile, usePersistPreferences } from '@/features/settings/api';
import { radii, semantic, useThemeColors } from '@/components/ui/tokens';
import { useSelectedTheme, type ColorSchemeType } from '@/lib/hooks/use-selected-theme';
import { cardPressStyle, webInteractive, webHoverStyle, webFocusRing, useReducedMotion, maybeReduce, springs, delays, staggerDelay } from '@/lib/motion';

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

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themedRow = { backgroundColor: surface.section };
  const valueBadge = [styles.valueBadge, { backgroundColor: surface.elevated }];
  const valueBadgeText = [styles.valueBadgeText, { color: t.muted }];
  const settingsRowDivider = [styles.settingsRowDivider, { backgroundColor: surface.border }];
  const rowHovered = [styles.rowHovered, { backgroundColor: surface.elevated }];

  const containerStyle = [
    themedRow,
    isFirst && styles.settingsRowFirstRadius,
    isLast && styles.settingsRowLastRadius,
  ];

  const content = (
    <>
      <View
        className="w-9 h-9 rounded-xl justify-center items-center"
        style={[styles.settingsRowIcon, { backgroundColor: iconColor + '18' }]}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text className="flex-1 text-[15px] font-semibold text-foreground">{label}</Text>
      <View className="flex-row items-center gap-1.5">
        {value ? (
          <View style={valueBadge}>
            <Text style={valueBadgeText}>{value}</Text>
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
        {!isLast && <View style={settingsRowDivider} />}
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
            ? rowHovered
            : undefined,
          // Web focus ring
          Platform.OS === 'web' && focused
            ? styles.webFocusRing as any
            : undefined,
        ]}
        onPress={onPress}
      >
        {content}
      </Pressable>
      {!isLast && <View style={settingsRowDivider} />}
    </>
  );
}

export default function SettingsScreen() {
  const { surface, text: t } = useThemeColors();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const { data: profile } = useProfile();
  const { mutate: persistPrefs } = usePersistPreferences();
  const { setSelectedTheme } = useSelectedTheme();

  const displayName = profile?.name || profile?.phone || 'User';
  const displayPhone = profile?.phone ?? '—';
  const stats = profile?.stats ?? { apps: 0, workflows: 0, messages: 0 };
  const prefs = profile?.preferences ?? {};
  const currentTheme = (prefs.theme as string) || 'Dark';
  const currentLanguage = (prefs.language as string) || 'English';
  const notificationsEnabled = prefs.notifications !== false;

  const THEME_OPTIONS = ['Dark', 'Light', 'System'];
  const LANGUAGE_OPTIONS = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese', 'Chinese'];

  /** Map display label → Uniwind ColorSchemeType */
  const themeValueMap: Record<string, ColorSchemeType> = {
    Dark: 'dark',
    Light: 'light',
    System: 'system',
  };

  function applyTheme(label: string) {
    persistPrefs({ theme: label });
    const scheme = themeValueMap[label];
    if (scheme) setSelectedTheme(scheme);
  }

  function handleSelectTheme() {
    if (Platform.OS === 'web') {
      const next = THEME_OPTIONS[(THEME_OPTIONS.indexOf(currentTheme) + 1) % THEME_OPTIONS.length];
      applyTheme(next);
      return;
    }
    Alert.alert('Theme', 'Choose a theme', [
      ...THEME_OPTIONS.map((t) => ({ text: t, onPress: () => applyTheme(t) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function handleSelectLanguage() {
    if (Platform.OS === 'web') {
      const next = LANGUAGE_OPTIONS[(LANGUAGE_OPTIONS.indexOf(currentLanguage) + 1) % LANGUAGE_OPTIONS.length];
      persistPrefs({ language: next });
      return;
    }
    Alert.alert('Language', 'Choose a language', [
      ...LANGUAGE_OPTIONS.map((l) => ({ text: l, onPress: () => persistPrefs({ language: l }) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function handleToggleNotifications() {
    persistPrefs({ notifications: !notificationsEnabled });
  }

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

  // Theme-dependent overrides
  const sectionLabel = { color: t.muted };
  const sectionBorder = [styles.sectionBorder, { borderColor: surface.border }];
  const statCardBase = [styles.statCardBase, { backgroundColor: surface.section, borderColor: surface.border }];
  const logoutHovered = styles.logoutHovered;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="pb-12">
        {/* Profile header */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, scale: 0.9 },
            animate: { opacity: 1, scale: 1 },
            transition: springs.gentle,
          }, reducedMotion)}
          className="items-center pt-6 pb-4"
        >
          <PipCard expression="happy" size="medium" className="mb-0" />
          <Text className="text-foreground text-xl font-extrabold mt-2">{displayName}</Text>
          <View className="flex-row items-center gap-1.5 mt-1">
            <View className="w-2 h-2 rounded-full bg-[#4ADE80]" />
            <Text className="text-[#4ADE80] text-xs font-semibold">Active</Text>
          </View>
        </MotiView>

        {/* Stats row */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, translateY: 10 },
            animate: { opacity: 1, translateY: 0 },
            transition: { ...springs.gentle, delay: staggerDelay(1, delays.normal) },
          }, reducedMotion)}
          className="flex-row gap-3 px-4 mb-6"
        >
          {[
            { num: String(stats.apps), label: 'Apps', color: semantic.info },
            { num: String(stats.workflows), label: 'Workflows', color: '#9B7EC8' },
            { num: String(stats.messages), label: 'Messages', color: '#6EC6B8' },
          ].map((stat, i) => (
            <MotiView
              key={stat.label}
              {...maybeReduce({
                from: { opacity: 0, scale: 0.8 },
                animate: { opacity: 1, scale: 1 },
                transition: { ...springs.bouncy, delay: staggerDelay(2 + i, delays.normal) },
              }, reducedMotion)}
              className="flex-1 rounded-2xl py-3 items-center"
              style={statCardBase}
            >
              <Text style={[styles.statNumber, { color: stat.color }]}>{stat.num}</Text>
              <Text style={[styles.statLabel, { color: t.muted }]}>{stat.label}</Text>
            </MotiView>
          ))}
        </MotiView>

        {/* Account section */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, translateX: -15 },
            animate: { opacity: 1, translateX: 0 },
            transition: { ...springs.gentle, delay: staggerDelay(3, delays.normal) },
          }, reducedMotion)}
          className="mt-2 px-4"
        >
          <Text className="text-[14px] font-bold uppercase tracking-widest mb-2 ml-1" style={sectionLabel}>Account</Text>
          <View className="rounded-2xl overflow-hidden" style={sectionBorder}>
            <SettingsRow icon="person-outline" iconColor="#6EC6B8" label="Profile" isFirst />
            <SettingsRow icon="call-outline" iconColor="#F5A623" label="Phone Number" value={displayPhone} showChevron={false} />
            <SettingsRow icon="apps-outline" iconColor={semantic.info} label="Connected Apps" value={`${stats.apps} apps`} onPress={() => router.push('/apps')} isLast />
          </View>
        </MotiView>

        {/* Preferences section */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, translateX: -15 },
            animate: { opacity: 1, translateX: 0 },
            transition: { ...springs.gentle, delay: staggerDelay(4, delays.normal) },
          }, reducedMotion)}
          className="mt-6 px-4"
        >
          <Text className="text-[14px] font-bold uppercase tracking-widest mb-2 ml-1" style={sectionLabel}>Preferences</Text>
          <View className="rounded-2xl overflow-hidden" style={sectionBorder}>
            <SettingsRow icon="notifications-outline" iconColor="#F5A623" label="Notifications" value={notificationsEnabled ? 'On' : 'Off'} onPress={handleToggleNotifications} isFirst />
            <SettingsRow icon="moon-outline" iconColor="#9B7EC8" label="Theme" value={currentTheme} onPress={handleSelectTheme} />
            <SettingsRow icon="language-outline" iconColor={semantic.info} label="Language" value={currentLanguage} onPress={handleSelectLanguage} isLast />
          </View>
        </MotiView>

        {/* About section */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0, translateX: -15 },
            animate: { opacity: 1, translateX: 0 },
            transition: { ...springs.gentle, delay: staggerDelay(5, delays.normal) },
          }, reducedMotion)}
          className="mt-6 px-4"
        >
          <Text className="text-[14px] font-bold uppercase tracking-widest mb-2 ml-1" style={sectionLabel}>About</Text>
          <View className="rounded-2xl overflow-hidden" style={sectionBorder}>
            <SettingsRow icon="information-circle-outline" iconColor={semantic.info} label="Version" value="1.0.0" showChevron={false} isFirst />
            <SettingsRow icon="shield-outline" iconColor="#6EC6B8" label="Privacy" />
            <SettingsRow icon="document-text-outline" iconColor="#8A8A8A" label="Terms" isLast />
          </View>
        </MotiView>

        {/* Logout */}
        <MotiView
          {...maybeReduce({
            from: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { ...springs.gentle, delay: staggerDelay(6, delays.normal) },
          }, reducedMotion)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            className="flex-row items-center justify-center gap-2 py-4 mt-8 mx-4 bg-[#FF3B30]/10 rounded-2xl"
            onPress={handleLogout}
            style={({ pressed, hovered, focused }: any) => [
              ...cardPressStyle({ pressed }),
              webInteractive(),
              // Web hover: enhance background
              Platform.OS === 'web' && hovered && !pressed
                ? logoutHovered
                : undefined,
              Platform.OS === 'web' && focused
                ? styles.logoutFocusRing as any
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

const styles = StyleSheet.create({
  // --- Extracted from inline SettingsRow styles ---
  valueBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  valueBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  settingsRowDivider: {
    height: 1,
    marginLeft: 56,
  },
  settingsRowIcon: {},
  rowHovered: {
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  } as any,
  // --- Extracted from main screen ---
  sectionBorder: {
    borderWidth: 1,
  },
  statCardBase: {
    borderWidth: 1,
  },
  logoutHovered: {
    backgroundColor: '#FF3B30/20',
    boxShadow: '0 2px 8px rgba(255, 59, 48, 0.2)',
  } as any,
  // --- Original static styles ---
  settingsRowFirstRadius: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  settingsRowLastRadius: {
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  webFocusRing: {
    boxShadow: '0 0 0 2px rgba(124, 92, 252, 0.3)',
  } as any,
  logoutFocusRing: {
    boxShadow: '0 0 0 2px rgba(255, 59, 48, 0.3)',
  } as any,
});
