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
  Image,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import PipCard from '../../src/PipCard';
import { colors, spacing, radius, shadows } from '../../src/theme';

interface ComposioApp {
  appId: string;
  key: string;
  name: string;
  logo?: string;
  categories?: string[];
  description?: string;
}

interface AppDisplay {
  slug: string;
  name: string;
  logo?: string;
  category: string;
  description?: string;
}

/** Fallback emoji map for well-known apps when logo URL fails */
const FALLBACK_EMOJI: Record<string, string> = {
  gmail: '\u{1F4E7}',
  slack: '\u{1F4AC}',
  github: '\u{1F419}',
  notion: '\u{1F4DD}',
  discord: '\u{1F3AE}',
  linear: '\u{1F4D0}',
  jira: '\u{1F3AF}',
  salesforce: '\u{2601}\u{FE0F}',
  dropbox: '\u{1F4E6}',
  twitter: '\u{1F426}',
  spotify: '\u{1F3B5}',
  googlecalendar: '\u{1F4C5}',
};

const CATEGORY_MAP: Record<string, string> = {
  'communication': 'Communication',
  'productivity': 'Productivity',
  'developer tools': 'Development',
  'development': 'Development',
  'crm': 'Productivity',
  'project management': 'Productivity',
  'social media': 'Communication',
  'entertainment': 'Entertainment',
  'storage': 'Productivity',
  'marketing': 'Marketing',
  'analytics': 'Analytics',
  'finance': 'Finance',
  'hr': 'HR',
  'security': 'Security',
};

function categorize(categories?: string[]): string {
  if (!categories?.length) return 'Other';
  for (const cat of categories) {
    const mapped = CATEGORY_MAP[cat.toLowerCase()];
    if (mapped) return mapped;
  }
  return categories[0] ?? 'Other';
}

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';
const TOP_N = 20;

export default function AppsScreen() {
  const [apps, setApps] = useState<AppDisplay[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [authError, setAuthError] = useState(false);
  const [failedLogos, setFailedLogos] = useState<Set<string>>(new Set());

  const fetchApps = useCallback(async () => {
    try {
      const data = await api.composio.listApps();
      const items: ComposioApp[] = data.items ?? [];
      // Take top 20 apps (Composio returns them ranked by popularity)
      const topApps: AppDisplay[] = items.slice(0, TOP_N).map((item) => ({
        slug: item.key,
        name: item.name,
        logo: item.logo,
        category: categorize(item.categories),
        description: item.description,
      }));
      setApps(topApps);
    } catch {
      // Fallback to a minimal hardcoded list if Composio API is unreachable
      setApps([
        { slug: 'gmail', name: 'Gmail', category: 'Communication' },
        { slug: 'googlecalendar', name: 'Calendar', category: 'Productivity' },
        { slug: 'slack', name: 'Slack', category: 'Communication' },
        { slug: 'github', name: 'GitHub', category: 'Development' },
        { slug: 'notion', name: 'Notion', category: 'Productivity' },
        { slug: 'discord', name: 'Discord', category: 'Communication' },
        { slug: 'linear', name: 'Linear', category: 'Development' },
        { slug: 'jira', name: 'Jira', category: 'Development' },
        { slug: 'salesforce', name: 'Salesforce', category: 'Productivity' },
        { slug: 'dropbox', name: 'Dropbox', category: 'Productivity' },
        { slug: 'twitter', name: 'Twitter', category: 'Communication' },
        { slug: 'spotify', name: 'Spotify', category: 'Entertainment' },
      ]);
    }
  }, []);

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
  }, []);

  useEffect(() => {
    Promise.all([fetchApps(), fetchStatus()]).finally(() => setLoading(false));
  }, [fetchApps, fetchStatus]);

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

  const categories = ['All', ...Array.from(new Set(apps.map(a => a.category)))];

  const filtered = apps.filter(a => {
    const matchesSearch = !search || a.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || a.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  function renderAppIcon(app: AppDisplay) {
    const hasLogo = app.logo && !failedLogos.has(app.slug);
    if (hasLogo) {
      return (
        <Image
          source={{ uri: app.logo }}
          style={styles.appLogo}
          resizeMode="contain"
          onError={() => setFailedLogos(prev => new Set(prev).add(app.slug))}
        />
      );
    }
    const emoji = FALLBACK_EMOJI[app.slug];
    if (emoji) {
      return <Text style={styles.appEmoji}>{emoji}</Text>;
    }
    return (
      <Text style={styles.appInitial}>
        {app.name.charAt(0).toUpperCase()}
      </Text>
    );
  }

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
        <Text style={styles.title}>Your Apps</Text>
        <View style={styles.headerRight}>
          <Text style={styles.appCount}>{apps.length} apps</Text>
          <TouchableOpacity onPress={() => setShowSearch(!showSearch)} style={styles.searchToggle}>
            <Ionicons name="search-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {showSearch && (
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder="Search apps..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
        </View>
      )}

      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        style={styles.pillScroll}
      >
        {categories.map(cat => {
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
              <View style={styles.appIconCircle}>
                {renderAppIcon(app)}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  appCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  searchToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
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
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },

  // App list
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },

  // App card
  appCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  appIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  appLogo: {
    width: 32,
    height: 32,
    borderRadius: 6,
  },
  appEmoji: { fontSize: 24 },
  appInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textSecondary,
  },
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
    borderRadius: radius.button,
    backgroundColor: colors.primary,
  },
  connectBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
