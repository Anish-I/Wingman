import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';

const CONNECTED_DEFAULT = ['googlecalendar', 'gmail', 'slack'];

const ALL_APPS = [
  { slug: 'googlecalendar', name: 'Calendar', emoji: '\u{1F4C5}' },
  { slug: 'gmail', name: 'Gmail', emoji: '\u2709\uFE0F' },
  { slug: 'slack', name: 'Slack', emoji: '\u{1F4AC}' },
  { slug: 'spotify', name: 'Spotify', emoji: '\u{1F3B5}' },
  { slug: 'notion', name: 'Notion', emoji: '\u{1F4DD}' },
  { slug: 'github', name: 'GitHub', emoji: '\u{1F419}' },
  { slug: 'discord', name: 'Discord', emoji: '\u{1F3AE}' },
  { slug: 'todoist', name: 'Todoist', emoji: '\u2705' },
  { slug: 'uber', name: 'Uber', emoji: '\u{1F697}' },
  { slug: 'venmo', name: 'Venmo', emoji: '\u{1F4B8}' },
  { slug: 'maps', name: 'Maps', emoji: '\u{1F5FA}\uFE0F' },
  { slug: 'twitter', name: 'X', emoji: '\u2716\uFE0F' },
  { slug: 'whatsapp', name: 'WhatsApp', emoji: '\u{1F4F1}' },
  { slug: 'trello', name: 'Trello', emoji: '\u{1F4CB}' },
  { slug: 'zoom', name: 'Zoom', emoji: '\u{1F3A5}' },
  { slug: 'figma', name: 'Figma', emoji: '\u{1F3A8}' },
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
            <View className="rounded px-2.5" style={{ backgroundColor: '#FF3B3020', paddingVertical: 4 }}>
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: '#FF3B30' }}>
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
                    <Text style={{ fontSize: 24 }}>{app.emoji}</Text>
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
