import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import * as WebBrowser from 'expo-web-browser';
import Env from 'env';
import PipCard from '@/components/wingman/pip-card';
import { useApps } from '@/features/apps/api';
import { client } from '@/lib/api/client';
import { getToken } from '@/lib/auth/utils';

interface AppInfo {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  category: string;
}

const KNOWN_APPS: AppInfo[] = [
  // Communication
  { slug: 'gmail', name: 'Gmail', emoji: '\u{1F4E7}', color: '#EA4335', category: 'Communication' },
  { slug: 'slack', name: 'Slack', emoji: '\u{1F4AC}', color: '#4A154B', category: 'Communication' },
  { slug: 'discord', name: 'Discord', emoji: '\u{1F3AE}', color: '#5865F2', category: 'Communication' },
  { slug: 'whatsapp', name: 'WhatsApp', emoji: '\u{1F4F1}', color: '#25D366', category: 'Communication' },
  { slug: 'telegram', name: 'Telegram', emoji: '\u{1F4E8}', color: '#0088CC', category: 'Communication' },
  { slug: 'microsoft-teams', name: 'MS Teams', emoji: '\u{1F465}', color: '#6264A7', category: 'Communication' },
  // Productivity
  { slug: 'googlecalendar', name: 'Calendar', emoji: '\u{1F4C5}', color: '#4285F4', category: 'Productivity' },
  { slug: 'notion', name: 'Notion', emoji: '\u{1F4DD}', color: '#000000', category: 'Productivity' },
  { slug: 'todoist', name: 'Todoist', emoji: '\u2705', color: '#E44332', category: 'Productivity' },
  { slug: 'trello', name: 'Trello', emoji: '\u{1F4CA}', color: '#0052CC', category: 'Productivity' },
  { slug: 'asana', name: 'Asana', emoji: '\u{1F4CB}', color: '#F06A6A', category: 'Productivity' },
  { slug: 'airtable', name: 'Airtable', emoji: '\u{1F4CA}', color: '#18BFFF', category: 'Productivity' },
  { slug: 'clickup', name: 'ClickUp', emoji: '\u{1F680}', color: '#7B68EE', category: 'Productivity' },
  { slug: 'monday', name: 'Monday', emoji: '\u{1F4C6}', color: '#FF3D57', category: 'Productivity' },
  // Development
  { slug: 'github', name: 'GitHub', emoji: '\u{1F419}', color: '#333333', category: 'Development' },
  { slug: 'linear', name: 'Linear', emoji: '\u{1F4D0}', color: '#5E6AD2', category: 'Development' },
  { slug: 'jira', name: 'Jira', emoji: '\u{1F3AF}', color: '#0052CC', category: 'Development' },
  { slug: 'gitlab', name: 'GitLab', emoji: '\u{1F98A}', color: '#FC6D26', category: 'Development' },
  { slug: 'vercel', name: 'Vercel', emoji: '\u25B2', color: '#000000', category: 'Development' },
  { slug: 'sentry', name: 'Sentry', emoji: '\u{1F41B}', color: '#362D59', category: 'Development' },
  // Cloud
  { slug: 'googledrive', name: 'Google Drive', emoji: '\u{1F4C1}', color: '#4285F4', category: 'Cloud' },
  { slug: 'dropbox', name: 'Dropbox', emoji: '\u{1F4E6}', color: '#0061FF', category: 'Cloud' },
  { slug: 'onedrive', name: 'OneDrive', emoji: '\u2601\uFE0F', color: '#0078D4', category: 'Cloud' },
  { slug: 'box', name: 'Box', emoji: '\u{1F4E6}', color: '#0061D5', category: 'Cloud' },
  // Entertainment
  { slug: 'spotify', name: 'Spotify', emoji: '\u{1F3B5}', color: '#1DB954', category: 'Entertainment' },
  { slug: 'youtube', name: 'YouTube', emoji: '\u{1F3AC}', color: '#FF0000', category: 'Entertainment' },
  // Finance
  { slug: 'stripe', name: 'Stripe', emoji: '\u{1F4B3}', color: '#635BFF', category: 'Finance' },
  { slug: 'quickbooks', name: 'QuickBooks', emoji: '\u{1F4B0}', color: '#2CA01C', category: 'Finance' },
  // CRM
  { slug: 'salesforce', name: 'Salesforce', emoji: '\u2601\uFE0F', color: '#00A1E0', category: 'CRM' },
  { slug: 'hubspot', name: 'HubSpot', emoji: '\u{1F9F2}', color: '#FF7A59', category: 'CRM' },
  { slug: 'pipedrive', name: 'Pipedrive', emoji: '\u{1F4C8}', color: '#017737', category: 'CRM' },
  // Social
  { slug: 'twitter', name: 'Twitter/X', emoji: '\u{1F426}', color: '#1DA1F2', category: 'Social' },
  { slug: 'linkedin', name: 'LinkedIn', emoji: '\u{1F4BC}', color: '#0A66C2', category: 'Social' },
  { slug: 'reddit', name: 'Reddit', emoji: '\u{1F4E2}', color: '#FF4500', category: 'Social' },
  { slug: 'instagram', name: 'Instagram', emoji: '\u{1F4F7}', color: '#E1306C', category: 'Social' },
];

export default function AppsScreen() {
  const { data, isLoading, refetch } = useApps();
  const [connected, setConnected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (data?.connected) setConnected(data.connected);
  }, [data]);

  const handleConnect = useCallback(async (slug: string) => {
    if (connected.includes(slug)) {
      // Disconnect using axios client (Bearer auth auto-added by interceptor)
      try {
        await client.post('/connect/disconnect', { app: slug });
        setConnected((prev) => prev.filter((s) => s !== slug));
        refetch();
      } catch {
        Alert.alert('Error', 'Failed to disconnect app.');
      }
      return;
    }

    // Connect via OAuth
    setConnectingSlug(slug);
    try {
      const token = getToken();
      const result = await WebBrowser.openAuthSessionAsync(
        `${Env.EXPO_PUBLIC_API_URL}/connect/initiate?app=${slug}&token=${token}`,
        'wingman://connect/callback',
      );
      if (result.type === 'success') {
        // Refetch connected status
        const res = await refetch();
        if (res.data?.connected) setConnected(res.data.connected);
      }
    } catch {
      Alert.alert('Error', 'Failed to connect app.');
    } finally {
      setConnectingSlug(null);
    }
  }, [connected, refetch]);

  const filtered = search
    ? KNOWN_APPS.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : KNOWN_APPS;

  const categories = [...new Set(filtered.map(a => a.category))];

  const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
    Communication: { icon: '💬', color: '#4A7BD9' },
    Productivity: { icon: '⚡', color: '#F5A623' },
    Development: { icon: '🛠️', color: '#9B7EC8' },
    Cloud: { icon: '☁️', color: '#6EC6B8' },
    Entertainment: { icon: '🎵', color: '#32D74B' },
    Finance: { icon: '💰', color: '#F5A623' },
    CRM: { icon: '🤝', color: '#4A7BD9' },
    Social: { icon: '🌐', color: '#9B7EC8' },
  };

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
        <Text className="text-[#4A7BD9] text-sm font-semibold mt-3">Loading your apps...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header with stats */}
      <MotiView
        from={{ opacity: 0, translateY: -10 }}
        animate={{ opacity: 1, translateY: 0 }}
        className="px-6 pt-6 pb-4"
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-[28px] font-extrabold">Your Apps</Text>
            <Text className="text-[#8A8A8A] text-sm mt-1">250+ apps available</Text>
          </View>
          {/* Connected count badge */}
          <MotiView
            from={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10, delay: 300 }}
          >
            <View className="bg-[#32D74B]/15 rounded-2xl px-4 py-2 items-center">
              <Text className="text-[#32D74B] text-[20px] font-extrabold">{connected.length}</Text>
              <Text className="text-[#32D74B] text-[10px] font-bold uppercase">Connected</Text>
            </View>
          </MotiView>
        </View>
      </MotiView>

      {/* Search */}
      <MotiView
        from={{ opacity: 0, translateY: 10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ delay: 150 }}
        className="flex-row items-center bg-[#1A1A1A] rounded-2xl mx-6 mb-4 px-4 border border-[#2A2A2A]"
      >
        <Ionicons name="search-outline" size={18} color="#525252" style={{ marginRight: 8 }} />
        <TextInput
          className="flex-1 py-3.5 text-foreground text-[15px]"
          placeholder="Search 250+ apps..."
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

      <FlatList
        data={categories}
        keyExtractor={c => c}
        contentContainerClassName="px-6 pb-12"
        ListEmptyComponent={
          <View className="items-center mt-10">
            <PipCard expression="thinking" message={`No apps matching "${search}"`} size="small" />
          </View>
        }
        renderItem={({ item: category, index: catIdx }) => {
          const apps = filtered.filter(a => a.category === category);
          const catInfo = CATEGORY_ICONS[category] || { icon: '📌', color: '#8A8A8A' };
          return (
            <MotiView
              from={{ opacity: 0, translateX: -20 }}
              animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'spring', damping: 15, delay: catIdx * 100 }}
              className="mb-6"
            >
              {/* Category header */}
              <View className="flex-row items-center gap-2 mb-3 ml-1">
                <Text className="text-lg">{catInfo.icon}</Text>
                <Text className="text-foreground text-base font-bold">{category}</Text>
                <View
                  className="rounded-full px-2 py-0.5"
                  style={{ backgroundColor: catInfo.color + '20' }}
                >
                  <Text style={{ color: catInfo.color, fontSize: 11, fontWeight: '700' }}>
                    {apps.filter(a => connected.includes(a.slug)).length}/{apps.length}
                  </Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
                {apps.map((app, appIdx) => {
                  const isConn = connected.includes(app.slug);
                  const isConnecting = connectingSlug === app.slug;
                  return (
                    <MotiView
                      key={app.slug}
                      from={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', damping: 12, delay: catIdx * 100 + appIdx * 50 }}
                    >
                      <TouchableOpacity
                        className="w-[90px] rounded-2xl p-3 items-center relative"
                        style={{
                          backgroundColor: isConn ? '#1A1A1A' : '#141416',
                          borderWidth: isConn ? 2 : 1,
                          borderColor: isConn ? '#32D74B50' : '#2A2A2A',
                        }}
                        onPress={() => handleConnect(app.slug)}
                        activeOpacity={0.7}
                        disabled={isConnecting}
                      >
                        {isConn && (
                          <MotiView
                            from={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', damping: 8 }}
                            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#32D74B] items-center justify-center z-10"
                          >
                            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                          </MotiView>
                        )}
                        {isConnecting && (
                          <View className="absolute top-2 right-2 z-10">
                            <ActivityIndicator size="small" color="#4A7BD9" />
                          </View>
                        )}
                        <View
                          className="w-[52px] h-[52px] rounded-2xl items-center justify-center mb-2"
                          style={{ backgroundColor: app.color + '18' }}
                        >
                          <Text className="text-[26px]">{app.emoji}</Text>
                        </View>
                        <Text className="text-foreground text-[11px] font-semibold text-center" numberOfLines={1}>{app.name}</Text>
                      </TouchableOpacity>
                    </MotiView>
                  );
                })}
              </ScrollView>
            </MotiView>
          );
        }}
      />
    </SafeAreaView>
  );
}
