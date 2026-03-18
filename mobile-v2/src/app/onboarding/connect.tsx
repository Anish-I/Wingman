import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';
import { AppIcon, type IconFamily } from '@/components/ui/app-icon';

interface OnboardingApp {
  slug: string;
  name: string;
  iconName: string;
  iconFamily: IconFamily;
  color: string;
}

const CONNECTED_DEFAULT = ['googlecalendar', 'gmail', 'slack'];

const ALL_APPS: OnboardingApp[] = [
  { slug: 'googlecalendar', name: 'Calendar', iconName: 'calendar-month', iconFamily: 'MaterialCommunityIcons', color: '#4285F4' },
  { slug: 'gmail', name: 'Gmail', iconName: 'gmail', iconFamily: 'MaterialCommunityIcons', color: '#EA4335' },
  { slug: 'slack', name: 'Slack', iconName: 'slack', iconFamily: 'MaterialCommunityIcons', color: '#4A154B' },
  { slug: 'spotify', name: 'Spotify', iconName: 'spotify', iconFamily: 'FontAwesome5', color: '#1DB954' },
  { slug: 'notion', name: 'Notion', iconName: 'note-text', iconFamily: 'MaterialCommunityIcons', color: '#000000' },
  { slug: 'github', name: 'GitHub', iconName: 'github', iconFamily: 'FontAwesome5', color: '#333333' },
  { slug: 'discord', name: 'Discord', iconName: 'discord', iconFamily: 'MaterialCommunityIcons', color: '#5865F2' },
  { slug: 'todoist', name: 'Todoist', iconName: 'checkbox-marked-circle-outline', iconFamily: 'MaterialCommunityIcons', color: '#E44332' },
  { slug: 'uber', name: 'Uber', iconName: 'car', iconFamily: 'MaterialCommunityIcons', color: '#000000' },
  { slug: 'venmo', name: 'Venmo', iconName: 'cash', iconFamily: 'MaterialCommunityIcons', color: '#3D95CE' },
  { slug: 'maps', name: 'Maps', iconName: 'map-marker', iconFamily: 'MaterialCommunityIcons', color: '#4285F4' },
  { slug: 'twitter', name: 'X', iconName: 'twitter', iconFamily: 'FontAwesome5', color: '#1DA1F2' },
  { slug: 'whatsapp', name: 'WhatsApp', iconName: 'whatsapp', iconFamily: 'FontAwesome5', color: '#25D366' },
  { slug: 'trello', name: 'Trello', iconName: 'trello', iconFamily: 'MaterialCommunityIcons', color: '#0052CC' },
  { slug: 'zoom', name: 'Zoom', iconName: 'video', iconFamily: 'MaterialCommunityIcons', color: '#2D8CFF' },
  { slug: 'figma', name: 'Figma', iconName: 'palette-swatch', iconFamily: 'MaterialCommunityIcons', color: '#F24E1E' },
];

export default function ConnectScreen() {
  const router = useRouter();
  const [connected, setConnected] = useState<string[]>(CONNECTED_DEFAULT);
  const [search, setSearch] = useState('');

  const filtered = search
    ? ALL_APPS.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : ALL_APPS;

  // Build rows of 4
  const rows: (typeof ALL_APPS)[] = [];
  for (let i = 0; i < filtered.length; i += 4) {
    rows.push(filtered.slice(i, i + 4));
  }

  function handleConnect(slug: string) {
    if (connected.includes(slug)) {
      setConnected((prev) => prev.filter((s) => s !== slug));
    } else {
      setConnected((prev) => [...prev, slug]);
    }
  }

  return (
    <SafeAreaView className="flex-1 items-center" style={{ backgroundColor: '#0C0C0C' }}>
      <ProgressBar step={6} />
      <View className="flex-1 w-full px-6" style={{ gap: 20 }}>
        {/* Header */}
        <View className="items-center" style={{ gap: 8 }}>
          <SectionLabel text="INTEGRATIONS" />
          <Text
            style={{
              fontFamily: 'Sora_700Bold',
              fontSize: 32,
              color: '#FFFFFF',
              letterSpacing: -1.5,
              lineHeight: 32,
              textAlign: 'center',
            }}
          >
            {'Connect\nYour Apps'}
          </Text>
          {/* Count row */}
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <View className="rounded px-2.5" style={{ backgroundColor: '#4A7BD920', paddingVertical: 4 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#4A7BD9' }}>
                {connected.length} CONNECTED
              </Text>
            </View>
            <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: '#8A8A8A' }}>
              of 1,000+ apps
            </Text>
          </View>
        </View>

        {/* Search bar */}
        <View
          className="flex-row items-center rounded-lg"
          style={{
            height: 44,
            backgroundColor: '#1A1A1A',
            borderWidth: 1,
            borderColor: '#2A2A2A',
            paddingHorizontal: 14,
            gap: 10,
          }}
        >
          <Ionicons name="search" size={18} color="#525252" />
          <TextInput
            className="flex-1"
            style={{ fontFamily: 'Inter_400Regular', fontSize: 14, color: '#FFFFFF' }}
            placeholder="Search apps..."
            placeholderTextColor="#525252"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* App grid */}
        <View style={{ gap: 10 }}>
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} className="flex-row" style={{ gap: 10 }}>
              {row.map((app) => {
                const isConnected = connected.includes(app.slug);
                return (
                  <TouchableOpacity
                    key={app.slug}
                    className="flex-1 items-center justify-center rounded-xl"
                    style={{
                      height: 80,
                      backgroundColor: '#1A1A1A',
                      borderWidth: isConnected ? 2 : 1,
                      borderColor: isConnected ? '#32D74B' : '#2A2A2A',
                      gap: 6,
                    }}
                    onPress={() => handleConnect(app.slug)}
                    activeOpacity={0.7}
                  >
                    <AppIcon iconName={app.iconName} iconFamily={app.iconFamily} size={24} color={app.color} />
                    <Text
                      style={{ fontFamily: 'Inter_500Medium', fontSize: 10, color: '#FFFFFF' }}
                      numberOfLines={1}
                    >
                      {app.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
            title="All Set!"
            icon="checkmark-circle"
            onPress={() => router.push('/onboarding/done')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
