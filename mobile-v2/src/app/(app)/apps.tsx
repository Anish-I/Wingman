import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import * as WebBrowser from 'expo-web-browser';
import Env from 'env';
import PipCard from '@/components/wingman/pip-card';
import { useApps } from '@/features/apps/api';
import { client } from '@/lib/api/client';
import allAppsRaw from '@/data/composio-apps.json';

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
  Communication: { icon: '\u{1F4AC}', color: '#4A7BD9' },
  Productivity: { icon: '\u26A1', color: '#F5A623' },
  Development: { icon: '\u{1F6E0}\uFE0F', color: '#9B7EC8' },
  'Cloud & Storage': { icon: '\u2601\uFE0F', color: '#6EC6B8' },
  Social: { icon: '\u{1F310}', color: '#9B7EC8' },
  Entertainment: { icon: '\u{1F3B5}', color: '#32D74B' },
  Finance: { icon: '\u{1F4B0}', color: '#F5A623' },
  'CRM & Support': { icon: '\u{1F91D}', color: '#4A7BD9' },
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
  return (
    <TouchableOpacity
      className="w-[90px] rounded-2xl p-3 items-center relative mr-2.5"
      style={{
        backgroundColor: isConnected ? '#1A1A1A' : '#141416',
        borderWidth: isConnected ? 2 : 1,
        borderColor: isConnected ? '#32D74B50' : '#2A2A2A',
      }}
      onPress={() => onPress(app.slug)}
      activeOpacity={0.7}
      disabled={isConnecting}
    >
      {isConnected && (
        <View className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#32D74B] items-center justify-center z-10">
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
        </View>
      )}
      {isConnecting && (
        <View className="absolute top-2 right-2 z-10">
          <ActivityIndicator size="small" color="#4A7BD9" />
        </View>
      )}
      <View className="w-[52px] h-[52px] rounded-2xl items-center justify-center mb-2 bg-[#1A1A1A]">
        <Image
          source={{ uri: app.logo }}
          style={{ width: 32, height: 32, borderRadius: 8 }}
          resizeMode="contain"
        />
      </View>
      <Text
        className="text-foreground text-[11px] font-semibold text-center"
        numberOfLines={1}
      >
        {app.name}
      </Text>
    </TouchableOpacity>
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
          <TouchableOpacity
            onPress={() => onSelect(isAll ? null : cat)}
            className="rounded-full px-3 py-1.5 flex-row items-center"
            style={{
              backgroundColor: active ? '#4A7BD920' : '#1A1A1A',
              borderWidth: 1,
              borderColor: active ? '#4A7BD9' : '#2A2A2A',
            }}
          >
            <Text
              style={{
                color: active ? '#4A7BD9' : '#8A8A8A',
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              {cat}
            </Text>
            <Text
              style={{
                color: active ? '#4A7BD9' : '#525252',
                fontSize: 10,
                fontWeight: '700',
                marginLeft: 4,
              }}
            >
              {count}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AppsScreen() {
  const { data, isLoading, refetch } = useApps();
  const [connected, setConnected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (data?.connected) setConnected(data.connected);
  }, [data]);

  // ---- connect / disconnect ----

  const handleConnect = useCallback(
    async (slug: string) => {
      if (connected.includes(slug)) {
        try {
          await client.post('/connect/disconnect', { app: slug });
          setConnected((prev) => prev.filter((s) => s !== slug));
          refetch();
        } catch {
          Alert.alert('Error', 'Failed to disconnect app.');
        }
        return;
      }

      setConnectingSlug(slug);
      try {
        const { data } = await client.post<{ connectToken: string }>(
          '/connect/create-connect-token',
          { app: slug },
        );
        const result = await WebBrowser.openAuthSessionAsync(
          `${Env.EXPO_PUBLIC_API_URL}/connect/initiate?connectToken=${data.connectToken}`,
          'wingman://connect/callback',
        );
        if (result.type === 'success') {
          const res = await refetch();
          if (res.data?.connected) setConnected(res.data.connected);
        }
      } catch {
        Alert.alert('Error', 'Failed to connect app.');
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

  // ---- loading state ----

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <MotiView
          from={{ rotate: '0deg' }}
          animate={{ rotate: '360deg' }}
          transition={{ type: 'timing', duration: 1000, loop: true }}
        >
          <Ionicons name="sync" size={32} color="#4A7BD9" />
        </MotiView>
        <Text className="text-[#4A7BD9] text-sm font-semibold mt-3">
          Loading your apps...
        </Text>
      </SafeAreaView>
    );
  }

  // ---- render ----

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <MotiView
        from={{ opacity: 0, translateY: -10 }}
        animate={{ opacity: 1, translateY: 0 }}
        className="px-6 pt-6 pb-4"
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-[28px] font-extrabold">
              Your Apps
            </Text>
            <Text className="text-[#8A8A8A] text-sm mt-1">
              {ALL_APPS.length} apps available
            </Text>
          </View>
          <MotiView
            from={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10, delay: 300 }}
          >
            <View className="bg-[#32D74B]/15 rounded-2xl px-4 py-2 items-center">
              <Text className="text-[#32D74B] text-[20px] font-extrabold">
                {connected.length}
              </Text>
              <Text className="text-[#32D74B] text-[10px] font-bold uppercase">
                Connected
              </Text>
            </View>
          </MotiView>
        </View>
      </MotiView>

      {/* Search */}
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ delay: 150 }}
        className="flex-row items-center bg-[#1A1A1A] rounded-2xl mx-6 mb-3 px-4 border border-[#2A2A2A]"
      >
        <Ionicons
          name="search-outline"
          size={18}
          color="#525252"
          style={{ marginRight: 8 }}
        />
        <TextInput
          className="flex-1 py-3.5 text-foreground text-[15px]"
          placeholder={`Search ${ALL_APPS.length} apps...`}
          placeholderTextColor="#525252"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#525252" />
          </TouchableOpacity>
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
