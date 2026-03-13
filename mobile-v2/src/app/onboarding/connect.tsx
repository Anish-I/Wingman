import React, { useState } from 'react';
import { View, Text, FlatList, TextInput, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Env from 'env';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';

const pipImages: Record<string, any> = {
  happy: require('../../../assets/pip/pip-happy.png'),
  excited: require('../../../assets/pip/pip-excited.png'),
};

const ALL_APPS = [
  { slug: 'googlecalendar', name: 'Google Cal', emoji: '📅', brand: '#4285F4' },
  { slug: 'gmail', name: 'Gmail', emoji: '📧', brand: '#EA4335' },
  { slug: 'slack', name: 'Slack', emoji: '💬', brand: '#4A154B' },
  { slug: 'spotify', name: 'Spotify', emoji: '🎵', brand: '#1DB954' },
  { slug: 'notion', name: 'Notion', emoji: '📝', brand: '#000000' },
  { slug: 'github', name: 'GitHub', emoji: '🐙', brand: '#333333' },
  { slug: 'discord', name: 'Discord', emoji: '🎮', brand: '#5865F2' },
  { slug: 'todoist', name: 'Todoist', emoji: '✅', brand: '#E44332' },
  { slug: 'uber', name: 'Uber', emoji: '🚗', brand: '#000000' },
  { slug: 'venmo', name: 'Venmo', emoji: '💳', brand: '#3D95CE' },
  { slug: 'maps', name: 'Maps', emoji: '🗺️', brand: '#34A853' },
  { slug: 'twitter', name: 'Twitter', emoji: '🐦', brand: '#1DA1F2' },
  { slug: 'whatsapp', name: 'WhatsApp', emoji: '📱', brand: '#25D366' },
  { slug: 'trello', name: 'Trello', emoji: '📋', brand: '#0052CC' },
  { slug: 'zoom', name: 'Zoom', emoji: '📹', brand: '#2D8CFF' },
  { slug: 'figma', name: 'Figma', emoji: '🎨', brand: '#F24E1E' },
];

export default function ConnectScreen() {
  const router = useRouter();
  const [connected, setConnected] = useState<string[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = search
    ? ALL_APPS.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : ALL_APPS;

  async function handleConnect(slug: string) {
    setConnecting(slug);
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `${Env.EXPO_PUBLIC_API_URL}/connect/${slug}`,
        'wingman://connect/callback'
      );
      if (result.type === 'success') {
        setConnected(prev => [...prev, slug]);
      }
    } catch {}
    setConnecting(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ProgressBar step={6} />
      <View className="flex-1 px-6">
        <View className="flex-row items-center mb-4 mt-2">
          <Image
            source={connected.length > 0 ? pipImages.excited : pipImages.happy}
            style={{ width: 44, height: 44, marginRight: 8 }}
            resizeMode="contain"
          />
          <View className="flex-1">
            <Text className="text-foreground text-xl font-bold">Connect Your Apps</Text>
            <Text className="text-muted-foreground text-[13px] mt-0.5">{connected.length} of 1000+ apps</Text>
          </View>
        </View>

        <View className="h-[3px] bg-border rounded-full mb-4 overflow-hidden">
          <LinearGradient
            colors={['#4A7BD9', '#6EC6B8', '#9B7EC8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: '100%', width: `${Math.max(5, (connected.length / ALL_APPS.length) * 100)}%`, borderRadius: 9999 }}
          />
        </View>

        <View className="flex-row items-center bg-card rounded-[14px] border border-border mb-4 px-4">
          <Ionicons name="search" size={18} color="#9A9BBF" style={{ marginRight: 8 }} />
          <TextInput
            className="flex-1 py-3 text-foreground text-[15px]"
            placeholder="Search 1000+ apps"
            placeholderTextColor="#9A9BBF"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <FlatList
          data={filtered}
          numColumns={4}
          keyExtractor={item => item.slug}
          contentContainerClassName="gap-2"
          columnWrapperClassName="gap-2"
          renderItem={({ item }) => {
            const isConnected = connected.includes(item.slug);
            return (
              <View className="flex-1 items-center">
                {connecting === item.slug ? (
                  <View className="w-14 h-14 rounded-[14px] bg-card justify-center items-center">
                    <ActivityIndicator color="#6EC6B8" />
                  </View>
                ) : (
                  <TouchableOpacity
                    className="w-14 h-14 rounded-[14px] justify-center items-center"
                    style={{ backgroundColor: isConnected ? item.brand : '#242540' }}
                    onPress={() => handleConnect(item.slug)}
                    activeOpacity={0.7}
                  >
                    <Text className="text-[26px]">{item.emoji}</Text>
                    {isConnected && (
                      <View className="absolute -top-[3px] -right-[3px] w-4 h-4 rounded-full bg-[#34C759] justify-center items-center border-2 border-background">
                        <Ionicons name="checkmark" size={8} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                <Text className="text-muted-foreground text-[11px] font-medium text-center mt-1" numberOfLines={1}>{item.name}</Text>
              </View>
            );
          }}
        />
      </View>
      <View className="px-6 pb-8">
        {connected.length === 0 && (
          <TouchableOpacity onPress={() => router.push('/onboarding/permissions')}>
            <Text className="text-muted-foreground text-sm text-center py-2">Skip for now</Text>
          </TouchableOpacity>
        )}
        <GradientButton
          title="All set!"
          onPress={() => router.push('/onboarding/permissions')}
        />
      </View>
    </SafeAreaView>
  );
}
