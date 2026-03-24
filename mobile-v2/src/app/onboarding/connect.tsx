import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';
import { AppIcon, type IconFamily } from '@/components/ui/app-icon';
import { base, semantic, typography, useThemeColors } from '@/components/ui/tokens';

interface OnboardingApp {
  slug: string;
  name: string;
  iconName: string;
  iconFamily: IconFamily;
  color: string;
}

const ALL_APPS: OnboardingApp[] = [
  { slug: 'googlecalendar', name: 'Calendar', iconName: 'calendar-month', iconFamily: 'MaterialCommunityIcons', color: '#4285F4' },
  { slug: 'gmail', name: 'Gmail', iconName: 'gmail', iconFamily: 'MaterialCommunityIcons', color: '#EA4335' },
  { slug: 'slack', name: 'Slack', iconName: 'slack', iconFamily: 'MaterialCommunityIcons', color: '#4A154B' },
  { slug: 'spotify', name: 'Spotify', iconName: 'spotify', iconFamily: 'FontAwesome5', color: '#1DB954' },
  { slug: 'notion', name: 'Notion', iconName: 'note-text', iconFamily: 'MaterialCommunityIcons', color: base.black },
  { slug: 'github', name: 'GitHub', iconName: 'github', iconFamily: 'FontAwesome5', color: '#333333' },
  { slug: 'discord', name: 'Discord', iconName: 'discord', iconFamily: 'MaterialCommunityIcons', color: '#5865F2' },
  { slug: 'todoist', name: 'Todoist', iconName: 'checkbox-marked-circle-outline', iconFamily: 'MaterialCommunityIcons', color: '#E44332' },
  { slug: 'uber', name: 'Uber', iconName: 'car', iconFamily: 'MaterialCommunityIcons', color: base.black },
  { slug: 'venmo', name: 'Venmo', iconName: 'cash', iconFamily: 'MaterialCommunityIcons', color: '#3D95CE' },
  { slug: 'maps', name: 'Maps', iconName: 'map-marker', iconFamily: 'MaterialCommunityIcons', color: '#4285F4' },
  { slug: 'twitter', name: 'X', iconName: 'twitter', iconFamily: 'FontAwesome5', color: '#1DA1F2' },
  { slug: 'whatsapp', name: 'WhatsApp', iconName: 'whatsapp', iconFamily: 'FontAwesome5', color: '#25D366' },
  { slug: 'trello', name: 'Trello', iconName: 'trello', iconFamily: 'MaterialCommunityIcons', color: '#0052CC' },
  { slug: 'zoom', name: 'Zoom', iconName: 'video', iconFamily: 'MaterialCommunityIcons', color: '#2D8CFF' },
  { slug: 'figma', name: 'Figma', iconName: 'palette-swatch', iconFamily: 'MaterialCommunityIcons', color: '#F24E1E' },
];

export default function ConnectScreen() {
  const { surface, text: t } = useThemeColors();
  const router = useRouter();
  const [search, setSearch] = useState('');

  // Theme-dependent styles
  const themed = {
    safeArea: { backgroundColor: surface.bg },
    headerTitle: { color: t.primary },
    infoBanner: {
      backgroundColor: `${semantic.info}15`,
      paddingVertical: 8,
      gap: 6,
    },
    infoText: { fontFamily: 'Inter_400Regular' as const, fontSize: 12, color: t.muted },
    searchBar: {
      height: 44,
      backgroundColor: surface.section,
      borderWidth: 1,
      borderColor: surface.border,
      paddingHorizontal: 14,
      gap: 10,
    },
    searchInput: { fontFamily: 'Inter_400Regular' as const, fontSize: 14, color: t.primary },
    appCard: {
      height: 80,
      backgroundColor: surface.section,
      borderWidth: 1,
      borderColor: surface.border,
      gap: 6,
    },
    appName: { fontFamily: 'Inter_500Medium' as const, fontSize: 10, color: t.primary },
  };

  const filtered = search
    ? ALL_APPS.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : ALL_APPS;

  // Build rows of 4
  const rows: (typeof ALL_APPS)[] = [];
  for (let i = 0; i < filtered.length; i += 4) {
    rows.push(filtered.slice(i, i + 4));
  }

  return (
    <SafeAreaView className="flex-1 items-center" style={themed.safeArea}>
      <ProgressBar step={6} />
      <View className="flex-1 w-full px-6" style={styles.mainContainer}>
        {/* Header */}
        <View className="items-center" style={styles.headerGap}>
          <SectionLabel text="INTEGRATIONS" />
          <Text style={[styles.headerTitle, themed.headerTitle]}>
            {'Your Apps\nAwait'}
          </Text>
          {/* Info banner */}
          <View
            className="flex-row items-center rounded-lg px-3"
            style={themed.infoBanner}
          >
            <Ionicons name="information-circle-outline" size={16} color={semantic.info} />
            <Text style={themed.infoText}>
              You'll connect these after setup
            </Text>
          </View>
        </View>

        {/* Search bar */}
        <View
          className="flex-row items-center rounded-lg"
          style={themed.searchBar}
        >
          <Ionicons name="search" size={18} color={t.disabled} />
          <TextInput
            className="flex-1"
            style={themed.searchInput}
            placeholder="Search apps..."
            placeholderTextColor={t.disabled}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* App grid — preview only, no toggles */}
        <View style={styles.gridContainer}>
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} className="flex-row" style={styles.gridRow}>
              {row.map((app) => (
                <View
                  key={app.slug}
                  className="flex-1 items-center justify-center rounded-xl"
                  style={themed.appCard}
                >
                  <AppIcon iconName={app.iconName} iconFamily={app.iconFamily} size={24} color={app.color} />
                  <Text
                    style={themed.appName}
                    numberOfLines={1}
                  >
                    {app.name}
                  </Text>
                </View>
              ))}
              {/* Fill remaining columns if row is incomplete */}
              {row.length < 4 &&
                Array.from({ length: 4 - row.length }).map((_, i) => (
                  <View key={`empty-${i}`} className="flex-1" />
                ))}
            </View>
          ))}
        </View>

        <View className="flex-1" />

        {/* Bottom button */}
        <View className="pb-8">
          <GradientButton
            title="Continue"
            icon="arrow-forward"
            onPress={() => router.push('/onboarding/done')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    gap: 20,
  },
  headerGap: {
    gap: 8,
  },
  headerTitle: {
    ...typography.hero,
    textAlign: 'center',
  },
  gridContainer: {
    gap: 10,
  },
  gridRow: {
    gap: 10,
  },
});
