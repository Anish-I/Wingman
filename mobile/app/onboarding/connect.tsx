import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import AppCard from '../../src/components/AppCard';
import { colors, spacing, radius } from '../../src/theme';

const FIRST_APPS = [
  { slug: 'gmail', name: 'Gmail', emoji: '\u{1F4E7}' },
  { slug: 'googlecalendar', name: 'Calendar', emoji: '\u{1F4C5}' },
  { slug: 'slack', name: 'Slack', emoji: '\u{1F4AC}' },
  { slug: 'github', name: 'GitHub', emoji: '\u{1F419}' },
  { slug: 'notion', name: 'Notion', emoji: '\u{1F4DD}' },
  { slug: 'discord', name: 'Discord', emoji: '\u{1F3AE}' },
];

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function ConnectScreen() {
  const router = useRouter();
  const [connected, setConnected] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = search
    ? FIRST_APPS.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : FIRST_APPS;

  async function handleConnect(slug: string) {
    setConnecting(slug);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${BASE}/connect/${slug}`,
        'wingman://connect/callback'
      );
      if (result.type === 'success') {
        setConnected(prev => [...prev, slug]);
      }
    } catch {}
    setConnecting(null);
  }

  const pipMessage = connected.length > 0
    ? `Nice! ${connected.length} app${connected.length > 1 ? 's' : ''} connected. You can add more later.`
    : "Let's connect your favorite apps.\nYou can always add more later.";

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={5} />
      <View style={styles.content}>
        <PipCard
          expression={connected.length > 0 ? 'happy' : 'cool'}
          message={pipMessage}
          size="small"
        />
        <TextInput
          style={styles.search}
          placeholder="Search apps..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        <FlatList
          data={filtered}
          numColumns={3}
          keyExtractor={item => item.slug}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              {connecting === item.slug ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : (
                <AppCard
                  name={item.name}
                  emoji={item.emoji}
                  connected={connected.includes(item.slug)}
                  onPress={() => handleConnect(item.slug)}
                />
              )}
            </View>
          )}
        />
      </View>
      <View style={styles.footer}>
        <GradientButton
          title={connected.length > 0 ? 'Continue' : 'Skip for now'}
          onPress={() => router.push('/onboarding/permissions')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  search: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  grid: { gap: spacing.sm },
  gridItem: { flex: 1 / 3 },
  loadingCard: {
    flex: 1,
    margin: 4,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
    minWidth: 90,
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
