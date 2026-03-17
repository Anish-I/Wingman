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
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import PipCard from '../../src/PipCard';
import { colors, spacing, radius } from '../../src/theme';

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

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AppsScreen() {
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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

  const filtered = search
    ? KNOWN_APPS.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : KNOWN_APPS;

  // Group by category
  const categories = [...new Set(filtered.map(a => a.category))];

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
        <Text style={styles.title}>Connected Apps</Text>
        <Text style={styles.subtitle}>
          {connected.length} of {KNOWN_APPS.length} connected
        </Text>
      </View>

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

      {authError && (
        <PipCard
          expression="thinking"
          message="Sign in to connect apps"
          size="small"
        />
      )}

      <FlatList
        data={categories}
        keyExtractor={c => c}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <PipCard
            expression="wave"
            message="Connect your favorite apps to get started!"
            size="small"
          />
        }
        renderItem={({ item: category }) => {
          const apps = filtered.filter(a => a.category === category);
          return (
            <View style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{category}</Text>
              <View style={styles.grid}>
                {apps.map(app => {
                  const isConnected = connected.includes(app.slug);
                  return (
                    <TouchableOpacity
                      key={app.slug}
                      style={styles.tile}
                      onPress={() => !isConnected && handleConnect(app.slug)}
                      activeOpacity={isConnected ? 1 : 0.7}
                    >
                      {isConnected && (
                        <View style={styles.connectedBadge}>
                          <Ionicons name="checkmark" size={9} color="#FFFFFF" />
                        </View>
                      )}
                      <View style={[styles.emojiCircle, { backgroundColor: app.color + '20' }]}>
                        <Text style={styles.emoji}>{app.emoji}</Text>
                      </View>
                      <Text style={styles.tileName} numberOfLines={1}>{app.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: { marginRight: spacing.sm },
  search: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  categorySection: {
    marginBottom: spacing.lg,
  },
  categoryTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: '30%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
  },
  connectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  emojiCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emoji: { fontSize: 24 },
  tileName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
