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
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { colors, spacing, radius } from '../../src/theme';

const KNOWN_APPS = [
  { slug: 'gmail', name: 'Gmail', emoji: '\u{1F4E7}' },
  { slug: 'googlecalendar', name: 'Calendar', emoji: '\u{1F4C5}' },
  { slug: 'slack', name: 'Slack', emoji: '\u{1F4AC}' },
  { slug: 'github', name: 'GitHub', emoji: '\u{1F419}' },
  { slug: 'notion', name: 'Notion', emoji: '\u{1F4DD}' },
  { slug: 'discord', name: 'Discord', emoji: '\u{1F3AE}' },
  { slug: 'linear', name: 'Linear', emoji: '\u{1F4D0}' },
  { slug: 'jira', name: 'Jira', emoji: '\u{1F3AF}' },
  { slug: 'salesforce', name: 'Salesforce', emoji: '\u{2601}\u{FE0F}' },
  { slug: 'dropbox', name: 'Dropbox', emoji: '\u{1F4E6}' },
  { slug: 'twitter', name: 'Twitter', emoji: '\u{1F426}' },
  { slug: 'spotify', name: 'Spotify', emoji: '\u{1F3B5}' },
];

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AppsScreen() {
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const status = await api.apps();
      setConnected(status.connected ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function handleConnect(slug: string) {
    const result = await WebBrowser.openAuthSessionAsync(
      `${BASE}/connect/${slug}`,
      'wingman://connect/callback'
    );
    if (result.type === 'success') await fetchStatus();
  }

  const filtered = search
    ? KNOWN_APPS.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : KNOWN_APPS;

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
        <Text style={styles.title}>My Flock</Text>
        <Text style={styles.subtitle}>{connected.length} connected</Text>
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

      <FlatList
        data={filtered}
        keyExtractor={item => item.slug}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isConnected = connected.includes(item.slug);
          return (
            <TouchableOpacity
              style={styles.appRow}
              onPress={() => !isConnected && handleConnect(item.slug)}
              activeOpacity={isConnected ? 1 : 0.7}
            >
              <Text style={styles.appEmoji}>{item.emoji}</Text>
              <View style={styles.appInfo}>
                <Text style={styles.appName}>{item.name}</Text>
                <Text style={[styles.appStatus, isConnected && styles.appStatusConnected]}>
                  {isConnected ? 'Connected' : 'Tap to connect'}
                </Text>
              </View>
              {isConnected ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              ) : (
                <Ionicons name="add-circle-outline" size={22} color={colors.textMuted} />
              )}
            </TouchableOpacity>
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
  list: { paddingHorizontal: spacing.lg },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appEmoji: { fontSize: 28, marginRight: spacing.md },
  appInfo: { flex: 1 },
  appName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  appStatus: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  appStatusConnected: { color: colors.success },
});
