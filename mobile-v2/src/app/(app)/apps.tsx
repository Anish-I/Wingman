import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useResponsive } from '@/lib/responsive';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import * as WebBrowser from 'expo-web-browser';
import { showMessage } from 'react-native-flash-message';
import Env from 'env';
import PipCard from '@/components/wingman/pip-card';
import { useApps } from '@/features/apps/api';
import { client } from '@/lib/api/client';
import allAppsRaw from '@/data/composio-apps.json';
import { useThemeColors } from '@/components/ui/tokens';
import { headerEntrance, entrance, chipPressStyle, pressStyle, webInteractive, webHoverStyle, webFocusRing, useReducedMotion, maybeReduce } from '@/lib/motion';

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, string> = {
  email: 'Communication',
  'team chat': 'Communication',
  communication: 'Communication',
  'phone & sms': 'Communication',
  'video conferencing': 'Communication',

  'project management': 'Productivity',
  productivity: 'Productivity',
  'task management': 'Productivity',
  'scheduling & booking': 'Productivity',
  notes: 'Productivity',
  documents: 'Productivity',
  'forms & surveys': 'Productivity',
  spreadsheets: 'Productivity',
  'productivity & project management': 'Productivity',
  'product management': 'Productivity',
  'time tracking software': 'Productivity',
  'team collaboration': 'Productivity',
  signatures: 'Productivity',
  'proposal & invoice management': 'Productivity',
  notifications: 'Productivity',
  'bookmark managers': 'Productivity',

  'developer tools': 'Development',
  'developer tools & devops': 'Development',
  databases: 'Development',
  'server monitoring': 'Development',
  'it operations': 'Development',
  'app builder': 'Development',
  'model context protocol': 'Development',
  'url shortener': 'Development',

  'file management & storage': 'Cloud & Storage',

  'social media accounts': 'Social',
  'social media marketing': 'Social',

  'video & audio': 'Entertainment',
  gaming: 'Entertainment',
  fitness: 'Entertainment',
  'news & lifestyle': 'Entertainment',
  webinars: 'Entertainment',
  transcription: 'Entertainment',

  'payment processing': 'Finance',
  accounting: 'Finance',
  taxes: 'Finance',
  fundraising: 'Finance',

  crm: 'CRM & Support',
  'customer support': 'CRM & Support',
  'sales & crm': 'CRM & Support',
  'contact management': 'CRM & Support',
  reviews: 'CRM & Support',

  ecommerce: 'E-commerce',
  'e-commerce': 'E-commerce',
  'website builders': 'E-commerce',

  analytics: 'Analytics',
  'business intelligence': 'Analytics',

  'hr talent & recruitment': 'HR',
  'human resources': 'HR',

  'artificial intelligence': 'AI & Automation',
  'ai agents': 'AI & Automation',
  'ai chatbots': 'AI & Automation',
  'ai models': 'AI & Automation',
  'ai assistants': 'AI & Automation',
  'ai content generation': 'AI & Automation',
  'ai document extraction': 'AI & Automation',
  'ai meeting assistants': 'AI & Automation',
  'ai sales tools': 'AI & Automation',
  'ai web scraping': 'AI & Automation',
  'ai safety compliance detection': 'AI & Automation',

  marketing: 'Marketing',
  'marketing automation': 'Marketing',
  'drip emails': 'Marketing',
  'email newsletters': 'Marketing',
  'transactional email': 'Marketing',
  'ads & conversion': 'Marketing',
  'event management': 'Marketing',

  'images & design': 'Design',

  'security & identity tools': 'Security',

  'internet of things': 'IoT',

  education: 'Other',
  'online courses': 'Other',
  tag1: 'Other',
};

function mapCategory(raw: string): string {
  return CATEGORY_MAP[raw.toLowerCase()] ?? 'Other';
}

// ---------------------------------------------------------------------------
// Processed app list (built once at module level)
// ---------------------------------------------------------------------------

interface ComposioApp {
  slug: string;
  name: string;
  logo: string;
  category: string;
  description: string;
  actionsCount: number;
  triggersCount: number;
}

const ALL_APPS: ComposioApp[] = (allAppsRaw as ComposioApp[]).map((a) => ({
  ...a,
  category: mapCategory(a.category),
}));

// Stable category ordering
const CATEGORY_ORDER = [
  'Communication',
  'Productivity',
  'Development',
  'Cloud & Storage',
  'Social',
  'Entertainment',
  'Finance',
  'CRM & Support',
  'E-commerce',
  'Analytics',
  'HR',
  'AI & Automation',
  'Marketing',
  'Design',
  'Security',
  'IoT',
  'Other',
];

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  Communication: { icon: '\u{1F4AC}', color: '#7C5CFC' },
  Productivity: { icon: '\u26A1', color: '#F5A623' },
  Development: { icon: '\u{1F6E0}\uFE0F', color: '#9171F5' },
  'Cloud & Storage': { icon: '\u2601\uFE0F', color: '#6EC6B8' },
  Social: { icon: '\u{1F310}', color: '#9171F5' },
  Entertainment: { icon: '\u{1F3B5}', color: '#32D74B' },
  Finance: { icon: '\u{1F4B0}', color: '#F5A623' },
  'CRM & Support': { icon: '\u{1F91D}', color: '#7C5CFC' },
  'E-commerce': { icon: '\u{1F6D2}', color: '#7AB55C' },
  Analytics: { icon: '\u{1F4CA}', color: '#7856FF' },
  HR: { icon: '\u{1F454}', color: '#4C6EF5' },
  'AI & Automation': { icon: '\u{1F916}', color: '#10A37F' },
  Marketing: { icon: '\u{1F4E3}', color: '#1A82E2' },
  Design: { icon: '\u{1F3A8}', color: '#F24E1E' },
  Security: { icon: '\u{1F512}', color: '#FF453A' },
  IoT: { icon: '\u{1F3E0}', color: '#15BEF0' },
  Other: { icon: '\u{1F4CC}', color: '#8A8A8A' },
};

// ---------------------------------------------------------------------------
// App card (memoised for FlatList performance)
// ---------------------------------------------------------------------------

interface AppCardProps {
  app: ComposioApp;
  isConnected: boolean;
  isConnecting: boolean;
  onPress: (slug: string) => void;
}

const AppCard = React.memo(function AppCard({
  app,
  isConnected,
  isConnecting,
  onPress,
}: AppCardProps) {
  const { surface } = useThemeColors();
  const { appCardWidth, appIconSize, appLogoSize } = useResponsive();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${app.name}, ${isConnected ? 'connected' : 'not connected'}`}
      className="rounded-2xl p-3 items-center relative mr-2.5"
      style={({ pressed, hovered, focused }: any) => [
        {
          width: appCardWidth,
          backgroundColor: isConnected ? surface.card : surface.cardAlt,
          borderWidth: isConnected ? 1.5 : 1,
          borderColor: isConnected ? 'rgba(50, 215, 75, 0.35)' : surface.border,
        },
        ...chipPressStyle({ pressed }),
        webInteractive(isConnecting),
        // Web hover: subtle lift with glow
        Platform.OS === 'web' && hovered && !pressed && !isConnecting
          ? {
              borderColor: surface.borderStrong,
              boxShadow: '0 6px 16px rgba(124, 92, 252, 0.15)',
              transform: [{ scale: 1.03 }],
            } as any
          : undefined,
        // Web focus ring
        Platform.OS === 'web' && focused && !isConnecting
          ? { boxShadow: '0 0 0 2px rgba(124, 92, 252, 0.8)' } as any
          : undefined,
      ]}
      onPress={() => onPress(app.slug)}
      disabled={isConnecting}
    >
      {isConnected && (
        <View className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#32D74B] items-center justify-center z-10">
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
        </View>
      )}
      {isConnecting && (
        <View className="absolute top-2 right-2 z-10">
          <ActivityIndicator size="small" color="#7C5CFC" />
        </View>
      )}
      <View className="rounded-2xl items-center justify-center mb-2" style={{ width: appIconSize, height: appIconSize, backgroundColor: surface.card }}>
        <Image
          source={{ uri: app.logo }}
          style={{ width: appLogoSize, height: appLogoSize, borderRadius: 8 }}
          resizeMode="contain"
        />
      </View>
      <Text
        className="text-foreground text-[11px] font-semibold text-center"
        numberOfLines={1}
      >
        {app.name}
      </Text>
    </Pressable>
  );
});

// ---------------------------------------------------------------------------
// Category section rendered inside FlatList
// ---------------------------------------------------------------------------

interface CategorySectionData {
  category: string;
  apps: ComposioApp[];
}

interface CategorySectionProps {
  section: CategorySectionData;
  connected: string[];
  connectingSlug: string | null;
  onPress: (slug: string) => void;
}

const CategorySection = React.memo(function CategorySection({
  section,
  connected,
  connectingSlug,
  onPress,
}: CategorySectionProps) {
  const meta = CATEGORY_META[section.category] ?? { icon: '\u{1F4CC}', color: '#8A8A8A' };
  const connectedCount = section.apps.filter((a) =>
    connected.includes(a.slug),
  ).length;

  return (
    <View className="mb-6">
      {/* Category header */}
      <View className="flex-row items-center gap-2 mb-3 ml-1">
        <Text className="text-lg">{meta.icon}</Text>
        <Text className="text-foreground text-base font-bold">
          {section.category}
        </Text>
        <View
          className="rounded-full px-2 py-0.5"
          style={{ backgroundColor: meta.color + '20' }}
        >
          <Text
            style={{ color: meta.color, fontSize: 11, fontWeight: '700' }}
          >
            {connectedCount}/{section.apps.length}
          </Text>
        </View>
      </View>

      {/* Horizontal app list */}
      <FlatList
        horizontal
        data={section.apps}
        keyExtractor={(a) => a.slug}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 16 }}
        initialNumToRender={6}
        maxToRenderPerBatch={10}
        windowSize={3}
        renderItem={({ item: app }) => (
          <AppCard
            app={app}
            isConnected={connected.includes(app.slug)}
            isConnecting={connectingSlug === app.slug}
            onPress={onPress}
          />
        )}
      />
    </View>
  );
});

// ---------------------------------------------------------------------------
// Category filter tabs
// ---------------------------------------------------------------------------

interface CategoryTabsProps {
  categories: string[];
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (cat: string | null) => void;
}

const CategoryTabs = React.memo(function CategoryTabs({
  categories,
  counts,
  selected,
  onSelect,
}: CategoryTabsProps) {
  const { surface, text: t } = useThemeColors();
  return (
    <FlatList
      horizontal
      data={['All', ...categories]}
      keyExtractor={(c) => c}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12, gap: 8 }}
      renderItem={({ item: cat }) => {
        const isAll = cat === 'All';
        const active = isAll ? selected === null : selected === cat;
        const count = isAll
          ? Object.values(counts).reduce((s, n) => s + n, 0)
          : (counts[cat] ?? 0);
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={`${cat} category, ${count} apps`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(isAll ? null : cat)}
            className="rounded-full px-3 py-1.5 flex-row items-center"
            style={({ pressed, hovered, focused }: any) => [
              {
                backgroundColor: active ? 'rgba(124, 92, 252, 0.22)' : surface.card,
                borderWidth: 1,
                borderColor: active ? '#7C5CFC' : surface.border,
              },
              ...chipPressStyle({ pressed }),
              webInteractive(),
              Platform.OS === 'web' && hovered && !pressed && !active
                ? { backgroundColor: surface.section, borderColor: surface.borderStrong } as any
                : undefined,
              Platform.OS === 'web' && hovered && !pressed && active
                ? { backgroundColor: 'rgba(124, 92, 252, 0.18)' } as any
                : undefined,
              Platform.OS === 'web' && focused
                ? { boxShadow: '0 0 0 2px rgba(124, 92, 252, 0.8)' } as any
                : undefined,
            ]}
          >
            <Text
              style={{
                color: active ? '#7C5CFC' : t.muted,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {cat}
            </Text>
            <Text
              style={{
                color: active ? '#7C5CFC' : t.muted,
                fontSize: 10,
                fontWeight: '700',
                marginLeft: 4,
              }}
            >
              {count}
            </Text>
          </Pressable>
        );
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AppsScreen() {
  const { surface, text: t } = useThemeColors();
  const { appCardWidth } = useResponsive();
  const reduced = useReducedMotion();
  const { data, isLoading, error: fetchError, refetch } = useApps();
  const [connected, setConnected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      setLoadingSlow(false);
      return;
    }
    // Show "slow" hint early so users know something is happening
    const slowTimer = setTimeout(() => setLoadingSlow(true), 3000);
    // Treat as failed after 8 seconds — most users abandon before 10s
    const failTimer = setTimeout(() => setLoadingTimedOut(true), 8000);
    return () => { clearTimeout(slowTimer); clearTimeout(failTimer); };
  }, [isLoading]);

  useEffect(() => {
    if (data?.connected) setConnected(data.connected);
  }, [data]);

  // ---- connect / disconnect ----

  const handleConnect = useCallback(
    async (slug: string) => {
      const showErr = (title: string, msg: string) => {
        if (Platform.OS === 'web') {
          showMessage({ message: title, description: msg, type: 'danger', duration: 3000 });
        } else {
          Alert.alert(title, msg);
        }
      };

      const friendlyError = (err: unknown, action: string) => {
        const e = err as any;
        const rawApiMsg = e?.response?.data?.error;
        const apiMsg =
          typeof rawApiMsg === 'object' && rawApiMsg !== null
            ? rawApiMsg.message ?? JSON.stringify(rawApiMsg)
            : rawApiMsg || e?.response?.data?.message;
        if (apiMsg) return String(apiMsg);
        if (e?.code === 'ECONNABORTED' || e?.message?.includes('timeout')) {
          return `Request timed out while trying to ${action}. Check your connection and try again.`;
        }
        if (e?.response?.status === 401 || e?.response?.status === 403) {
          return `Your session may have expired. Try signing out and back in.`;
        }
        if (!e?.response && e?.request) {
          return `Network error — check your internet connection and try again.`;
        }
        return `Failed to ${action}. Please try again later.`;
      };

      if (connected.includes(slug)) {
        const appName = ALL_APPS.find((a) => a.slug === slug)?.name ?? slug;
        const doDisconnect = async () => {
          try {
            await client.post('/connect/disconnect', { app: slug });
            setConnected((prev) => prev.filter((s) => s !== slug));
            refetch();
          } catch (err) {
            showErr('Disconnect Failed', friendlyError(err, 'disconnect app'));
          }
        };

        if (Platform.OS === 'web') {
          if (window.confirm(`Disconnect ${appName}? You will need to re-authenticate to use it again.`)) {
            await doDisconnect();
          }
        } else {
          Alert.alert(
            `Disconnect ${appName}?`,
            'You will need to re-authenticate to use this app again.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Disconnect', style: 'destructive', onPress: doDisconnect },
            ],
          );
        }
        return;
      }

      setConnectingSlug(slug);
      try {
        const { data } = await client.post<{ connectToken: string }>(
          '/connect/create-connect-token',
          { app: slug },
        );
        const redirectUrl = Platform.OS === 'web'
          ? `${window.location.origin}/connect/callback`
          : 'wingman://connect/callback';
        const result = await WebBrowser.openAuthSessionAsync(
          `${Env.EXPO_PUBLIC_API_URL}/connect/initiate?connectToken=${data.connectToken}`,
          redirectUrl,
        );
        if (result.type === 'success') {
          const res = await refetch();
          if (res.data?.connected) setConnected(res.data.connected);
        }
      } catch (err) {
        showErr('Connection Failed', friendlyError(err, 'connect app'));
      } finally {
        setConnectingSlug(null);
      }
    },
    [connected, refetch],
  );

  // ---- filtering ----

  const filtered = useMemo(() => {
    let apps = ALL_APPS;
    if (search) {
      const q = search.toLowerCase();
      apps = apps.filter((a) => a.name.toLowerCase().includes(q));
    }
    if (selectedCategory) {
      apps = apps.filter((a) => a.category === selectedCategory);
    }
    return apps;
  }, [search, selectedCategory]);

  // Build sections sorted by CATEGORY_ORDER
  const sections: CategorySectionData[] = useMemo(() => {
    const map = new Map<string, ComposioApp[]>();
    for (const app of filtered) {
      const list = map.get(app.category);
      if (list) list.push(app);
      else map.set(app.category, [app]);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      apps: map.get(c)!,
    }));
  }, [filtered]);

  // Category counts (unfiltered by category so tabs always show totals)
  const categoryCounts = useMemo(() => {
    let apps = ALL_APPS;
    if (search) {
      const q = search.toLowerCase();
      apps = apps.filter((a) => a.name.toLowerCase().includes(q));
    }
    const counts: Record<string, number> = {};
    for (const a of apps) {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
    }
    return counts;
  }, [search]);

  const visibleCategories = useMemo(
    () => CATEGORY_ORDER.filter((c) => (categoryCounts[c] ?? 0) > 0),
    [categoryCounts],
  );

  // ---- loading / error state ----

  if (fetchError || (isLoading && loadingTimedOut)) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center px-6">
        <Ionicons name="cloud-offline-outline" size={40} color={t.muted} />
        <Text className="text-foreground text-base font-bold mt-4">
          Failed to load
        </Text>
        <Text style={{ color: t.muted }} className="text-sm text-center mt-1">
          {fetchError
            ? 'Could not load your apps. Check your connection and try again.'
            : 'This is taking longer than expected. Check your connection and try again.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading apps"
          className="mt-5 bg-[#7C5CFC] rounded-xl px-6 py-3"
          onPress={() => { setLoadingTimedOut(false); refetch(); }}
        >
          <Text className="text-white text-sm font-bold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    const pulse = reduced ? {} : {
      from: { opacity: 0.35 },
      animate: { opacity: 0.75 },
      transition: { type: 'timing' as const, duration: 900, loop: true },
    };
    return (
      <SafeAreaView className="flex-1 bg-background">
        {/* Slow-loading hint */}
        {loadingSlow && (
          <View className="mx-6 mt-4 rounded-xl px-4 py-3 flex-row items-center" style={{ backgroundColor: 'rgba(245, 166, 35, 0.12)' }}>
            <Ionicons name="time-outline" size={18} color="#F5A623" style={{ marginRight: 8 }} />
            <Text style={{ color: '#F5A623', fontSize: 13, fontWeight: '600', flex: 1 }}>
              Still loading — check your connection if this persists
            </Text>
          </View>
        )}
        {/* Skeleton header */}
        <View className="px-6 pt-6 pb-4">
          <View className="flex-row items-center justify-between">
            <View>
              <MotiView {...pulse} className="h-7 w-36 rounded-lg" style={{ backgroundColor: surface.card }} />
              <MotiView {...pulse} className="h-4 w-28 rounded-md mt-2" style={{ backgroundColor: surface.card }} />
            </View>
            <MotiView {...pulse} className="w-16 h-14 rounded-2xl" style={{ backgroundColor: surface.card }} />
          </View>
        </View>
        {/* Skeleton search bar */}
        <View className="mx-6 mb-3">
          <MotiView {...pulse} className="h-12 rounded-2xl" style={{ backgroundColor: surface.card }} />
        </View>
        {/* Skeleton category tabs */}
        <View className="flex-row px-6 mb-4 gap-2">
          {[72, 88, 96, 64, 80].map((w, i) => (
            <MotiView key={i} {...pulse} className="h-8 rounded-full" style={{ backgroundColor: surface.card, width: w }} />
          ))}
        </View>
        {/* Skeleton category sections */}
        {[0, 1, 2].map((section) => (
          <View key={section} className="px-6 mb-6">
            <View className="flex-row items-center gap-2 mb-3">
              <MotiView {...pulse} className="w-6 h-6 rounded-md" style={{ backgroundColor: surface.card }} />
              <MotiView {...pulse} className="h-5 w-28 rounded-md" style={{ backgroundColor: surface.card }} />
            </View>
            <View className="flex-row gap-2.5">
              {[0, 1, 2, 3].map((card) => (
                <MotiView key={card} {...pulse} className="rounded-2xl" style={{ backgroundColor: surface.card, width: appCardWidth, height: appCardWidth * 1.1 }} />
              ))}
            </View>
          </View>
        ))}
      </SafeAreaView>
    );
  }

  // ---- render ----

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <MotiView
        {...maybeReduce(headerEntrance, reduced)}
        className="px-6 pt-6 pb-4"
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-[28px] font-extrabold">
              Your Apps
            </Text>
            <Text style={{ color: t.muted }} className="text-sm mt-1">
              {ALL_APPS.length} apps available
            </Text>
          </View>
          <MotiView
            {...maybeReduce({
              from: { opacity: 0, scale: 0.7 },
              animate: { opacity: 1, scale: 1 },
              transition: { type: 'spring', damping: 10, stiffness: 100, delay: 300 },
            }, reduced)}
          >
            <View className="bg-[#4ADE80]/15 rounded-2xl px-4 py-2 items-center">
              <Text className="text-[#4ADE80] text-[20px] font-extrabold">
                {connected.length}
              </Text>
              <Text className="text-[#4ADE80] text-[10px] font-bold uppercase">
                Connected
              </Text>
            </View>
          </MotiView>
        </View>
      </MotiView>

      {/* Search */}
      <MotiView
        {...maybeReduce(entrance(0, 100), reduced)}
        className="flex-row items-center rounded-2xl mx-6 mb-3 px-4"
        style={{ backgroundColor: surface.card, borderWidth: 1, borderColor: surface.border }}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={t.muted}
          style={{ marginRight: 8 }}
        />
        <TextInput
          className="flex-1 py-3.5 text-foreground text-[15px]"
          placeholder={`Search ${ALL_APPS.length} apps...`}
          placeholderTextColor={t.muted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} style={webInteractive()}>
            <Ionicons name="close-circle" size={18} color={t.muted} />
          </Pressable>
        )}
      </MotiView>

      {/* Category filter tabs */}
      <CategoryTabs
        categories={visibleCategories}
        counts={categoryCounts}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      {/* App list by category */}
      <FlatList
        data={sections}
        keyExtractor={(s) => s.category}
        contentContainerClassName="px-6 pb-12"
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        ListEmptyComponent={
          <View className="items-center mt-10">
            <PipCard
              expression="thinking"
              message={`No apps matching "${search}"`}
              size="small"
            />
          </View>
        }
        renderItem={({ item: section }) => (
          <CategorySection
            section={section}
            connected={connected}
            connectingSlug={connectingSlug}
            onPress={handleConnect}
          />
        )}
      />
    </SafeAreaView>
  );
}
