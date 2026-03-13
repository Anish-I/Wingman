import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import AppCard from '../../src/components/AppCard';
import { colors, spacing, radius } from '../../src/theme';

const FIRST_APPS = [
  { slug: 'gmail', name: 'Gmail', emoji: '📧' },
  { slug: 'googlecalendar', name: 'Calendar', emoji: '📅' },
  { slug: 'slack', name: 'Slack', emoji: '💬' },
  { slug: 'github', name: 'GitHub', emoji: '🐙' },
  { slug: 'notion', name: 'Notion', emoji: '📝' },
  { slug: 'discord', name: 'Discord', emoji: '🎮' },
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

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={5} />
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <PipCard expression={connected.length > 0 ? 'happy' : 'cool'} size="small" style={styles.pipSmall} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Connect Your Apps</Text>
            <Text style={styles.headerSubtitle}>
              {connected.length > 0
                ? `${connected.length} app${connected.length > 1 ? 's' : ''} connected`
                : 'Choose apps to get started'}
            </Text>
          </View>
        </View>

        {/* Gradient progress bar */}
        <View style={styles.progressTrack}>
          <LinearGradient
            colors={[colors.primaryLight, colors.accent, colors.purple]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.progressFill,
              { width: `${Math.max(10, (connected.length / FIRST_APPS.length) * 100)}%` as any },
            ]}
          />
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder="Search 1000+ apps"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* App grid */}
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
        <TouchableOpacity onPress={() => router.push('/onboarding/permissions')}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
        <GradientButton
          title="Continue"
          onPress={() => router.push('/onboarding/permissions')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  pipSmall: {
    paddingVertical: 0,
    marginRight: spacing.sm,
  },
  headerText: { flex: 1 },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  searchIcon: { marginRight: spacing.sm },
  search: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  grid: { gap: spacing.sm },
  gridItem: { flex: 1 / 3 },
  loadingCard: {
    flex: 1,
    margin: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 90,
    minWidth: 90,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  skipText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
