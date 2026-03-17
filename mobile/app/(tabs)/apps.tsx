import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TextInput,
  Platform,
  ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import PipCard from '../../src/PipCard';
import { colors, spacing, radius, shadows } from '../../src/theme';

interface AppInfo {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  category: string;
}

const KNOWN_APPS: AppInfo[] = [
  { slug: 'gmail', name: 'Gmail', emoji: '\u{1F4E7}', color: '#EA4335', category: 'Communication' },
  { slug: 'googlecalendar', name: 'Calendar', emoji: '\u{1F4C5}', color: '#4285F4', category: 'Productivity' },
  { slug: 'slack', name: 'Slack', emoji: '\u{1F4AC}', color: '#4A154B', category: 'Communication' },
  { slug: 'github', name: 'GitHub', emoji: '\u{1F419}', color: '#333333', category: 'Development' },
  { slug: 'notion', name: 'Notion', emoji: '\u{1F4DD}', color: '#000000', category: 'Productivity' },
  { slug: 'discord', name: 'Discord', emoji: '\u{1F3AE}', color: '#5865F2', category: 'Communication' },
  { slug: 'linear', name: 'Linear', emoji: '\u{1F4D0}', color: '#5E6AD2', category: 'Development' },
  { slug: 'jira', name: 'Jira', emoji: '\u{1F3AF}', color: '#0052CC', category: 'Development' },
  { slug: 'salesforce', name: 'Salesforce', emoji: '\u{2601}\u{FE0F}', color: '#00A1E0', category: 'Productivity' },
  { slug: 'dropbox', name: 'Dropbox', emoji: '\u{1F4E6}', color: '#0061FF', category: 'Productivity' },
  { slug: 'twitter', name: 'Twitter', emoji: '\u{1F426}', color: '#1DA1F2', category: 'Communication' },
  { slug: 'spotify', name: 'Spotify', emoji: '\u{1F3B5}', color: '#1DB954', category: 'Entertainment' },
];

const CATEGORIES = ['All', ...new Set(KNOWN_APPS.map(a => a.category))];

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AppsScreen() {
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [authError, setAuthError] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await api.apps();
      setConnected(status.connected ?? []);
      setAuthError(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        setAuthError(true);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleConnect(slug: string) {
    if (Platform.OS === 'web') {
      window.open(`${BASE}/connect/${slug}`, '_blank');
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(
      `${BASE}/connect/${slug}`,
      'wingman://connect/callback'
    );
    if (result.type === 'success') await fetchStatus();
  }

  const filtered = KNOWN_APPS.filter(a => {
    const matchesSearch = !search || a.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || a.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Apps</Text>
        <Text style={styles.subtitle}>
          {connected.length} of {KNOWN_APPS.length} connected
        </Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder="Search apps..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        style={styles.pillScroll}
      >
        {CATEGORIES.map(cat => {
          const isActive = selectedCategory === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => setSelectedCategory(cat)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {authError && (
        <PipCard
          expression="thinking"
          message="Sign in to connect apps"
          size="small"
        />
      )}

      <FlatList
        data={filtered}
        keyExtractor={a => a.slug}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <PipCard
            expression="wave"
            message="No apps found"
            size="small"
          />
        }
        renderItem={({ item: app }) => {
          const isConnected = connected.includes(app.slug);
          return (
            <View style={styles.appCard}>
              <View style={[styles.appIconCircle, { backgroundColor: app.color + '20' }]}>
                <Text style={styles.appEmoji}>{app.emoji}</Text>
              </View>
              <View style={styles.appInfo}>
                <Text style={styles.appName}>{app.name}</Text>
                <Text style={styles.appCategory}>{app.category}</Text>
              </View>
              {isConnected ? (
                <View style={styles.connectedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.connectBtn}
                  onPress={() => handleConnect(app.slug)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.connectBtnText}>Connect</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  searchIcon: { marginRight: spacing.sm },
  search: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },

  // Category pills
  pillScroll: {
    maxHeight: 44,
    marginBottom: spacing.md,
  },
  pillRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  pillActive: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: colors.primaryLight,
  },

  // App list
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },

  // App card
  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 12,
  },
  appIconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appEmoji: { fontSize: 24 },
  appInfo: { flex: 1 },
  appName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  appCategory: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  // Connected badge
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successMuted,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  connectedText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '600',
  },

  // Connect button
  connectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  connectBtnText: {
    color: colors.primaryLight,
    fontSize: 13,
    fontWeight: '600',
  },
});
