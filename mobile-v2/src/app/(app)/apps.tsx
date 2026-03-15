import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import Env from 'env';
import PipCard from '@/components/wingman/pip-card';
import { useApps } from '@/features/apps/api';
import { getToken } from '@/lib/auth/utils';

interface AppInfo {
  slug: string;
  name: string;
  emoji: string;
  color: string;
  category: string;
}

const KNOWN_APPS: AppInfo[] = [
  { slug: 'gmail', name: 'Gmail', emoji: '\u{1F4E7}', color: '#EA4335', category: 'Communication' },
  { slug: 'slack', name: 'Slack', emoji: '\u{1F4AC}', color: '#4A154B', category: 'Communication' },
  { slug: 'discord', name: 'Discord', emoji: '\u{1F3AE}', color: '#5865F2', category: 'Communication' },
  { slug: 'twitter', name: 'Twitter', emoji: '\u{1F426}', color: '#1DA1F2', category: 'Communication' },
  { slug: 'whatsapp', name: 'WhatsApp', emoji: '\u{1F4F1}', color: '#25D366', category: 'Communication' },
  { slug: 'googlecalendar', name: 'Calendar', emoji: '\u{1F4C5}', color: '#4285F4', category: 'Productivity' },
  { slug: 'notion', name: 'Notion', emoji: '\u{1F4DD}', color: '#000000', category: 'Productivity' },
  { slug: 'todoist', name: 'Todoist', emoji: '\u2705', color: '#E44332', category: 'Productivity' },
  { slug: 'trello', name: 'Trello', emoji: '\u{1F4CA}', color: '#0052CC', category: 'Productivity' },
  { slug: 'dropbox', name: 'Dropbox', emoji: '\u{1F4E6}', color: '#0061FF', category: 'Productivity' },
  { slug: 'github', name: 'GitHub', emoji: '\u{1F419}', color: '#333333', category: 'Development' },
  { slug: 'linear', name: 'Linear', emoji: '\u{1F4D0}', color: '#5E6AD2', category: 'Development' },
  { slug: 'jira', name: 'Jira', emoji: '\u{1F3AF}', color: '#0052CC', category: 'Development' },
  { slug: 'spotify', name: 'Spotify', emoji: '\u{1F3B5}', color: '#1DB954', category: 'Entertainment' },
  { slug: 'youtube', name: 'YouTube', emoji: '\u{1F3AC}', color: '#FF0000', category: 'Entertainment' },
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
      // Disconnect
      try {
        const token = getToken();
        await fetch(`${Env.EXPO_PUBLIC_API_URL}/connect/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ app: slug, token }),
        });
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
        'wingman://connect/callback'
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

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator color="#4A7BD9" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-6 pb-4">
        <Text className="text-foreground text-[28px] font-extrabold">Connected Apps</Text>
        <Text className="text-muted-foreground text-sm mt-1">{connected.length} of {KNOWN_APPS.length}+ apps connected</Text>
      </View>

      <View className="flex-row items-center bg-card rounded-[14px] mx-6 mb-4 px-4 border border-border">
        <Ionicons name="search-outline" size={18} color="#525252" style={{ marginRight: 8 }} />
        <TextInput
          className="flex-1 py-3 text-foreground text-[15px]"
          placeholder="Search apps..."
          placeholderTextColor="#525252"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={categories}
        keyExtractor={c => c}
        contentContainerClassName="px-6 pb-12"
        ListEmptyComponent={
          <PipCard expression="wave" message="Connect your favorite apps to get started!" size="small" />
        }
        renderItem={({ item: category }) => {
          const apps = filtered.filter(a => a.category === category);
          return (
            <View className="mb-6">
              <Text className="text-foreground text-base font-bold mb-2 ml-1">{category}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
                {apps.map(app => {
                  const isConn = connected.includes(app.slug);
                  const isConnecting = connectingSlug === app.slug;
                  return (
                    <TouchableOpacity
                      key={app.slug}
                      className="w-[88px] bg-card rounded-[14px] p-3 items-center relative border border-border"
                      onPress={() => handleConnect(app.slug)}
                      activeOpacity={0.7}
                      disabled={isConnecting}
                    >
                      {isConn && (
                        <View className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[#32D74B] items-center justify-center z-10">
                          <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                        </View>
                      )}
                      {isConnecting && (
                        <View className="absolute top-2 right-2 z-10">
                          <ActivityIndicator size="small" color="#4A7BD9" />
                        </View>
                      )}
                      <View
                        className="w-14 h-14 rounded-full items-center justify-center mb-2"
                        style={{ backgroundColor: app.color + '18' }}
                      >
                        <Text className="text-[28px]">{app.emoji}</Text>
                      </View>
                      <Text className="text-foreground text-xs font-medium text-center" numberOfLines={1}>{app.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}
