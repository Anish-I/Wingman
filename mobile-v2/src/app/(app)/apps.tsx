import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import * as WebBrowser from 'expo-web-browser';
import Env from 'env';
import PipCard from '@/components/wingman/pip-card';
import { AppIcon, type IconFamily } from '@/components/ui/app-icon';
import { useApps } from '@/features/apps/api';
import { client } from '@/lib/api/client';

interface AppInfo {
  slug: string;
  name: string;
  iconName: string;
  iconFamily: IconFamily;
  color: string;
  category: string;
}

const KNOWN_APPS: AppInfo[] = [
  // Communication
  { slug: 'gmail', name: 'Gmail', iconName: 'gmail', iconFamily: 'MaterialCommunityIcons', color: '#EA4335', category: 'Communication' },
  { slug: 'slack', name: 'Slack', iconName: 'slack', iconFamily: 'MaterialCommunityIcons', color: '#4A154B', category: 'Communication' },
  { slug: 'discord', name: 'Discord', iconName: 'discord', iconFamily: 'MaterialCommunityIcons', color: '#5865F2', category: 'Communication' },
  { slug: 'whatsapp', name: 'WhatsApp', iconName: 'whatsapp', iconFamily: 'FontAwesome5', color: '#25D366', category: 'Communication' },
  { slug: 'telegram', name: 'Telegram', iconName: 'telegram', iconFamily: 'MaterialCommunityIcons', color: '#0088cc', category: 'Communication' },
  { slug: 'microsoft-teams', name: 'MS Teams', iconName: 'microsoft-teams', iconFamily: 'MaterialCommunityIcons', color: '#6264A7', category: 'Communication' },
  { slug: 'outlook', name: 'Outlook', iconName: 'microsoft-outlook', iconFamily: 'MaterialCommunityIcons', color: '#0078D4', category: 'Communication' },
  { slug: 'signal', name: 'Signal', iconName: 'signal', iconFamily: 'MaterialCommunityIcons', color: '#3A76F0', category: 'Communication' },
  // Productivity
  { slug: 'googlecalendar', name: 'Calendar', iconName: 'calendar-month', iconFamily: 'MaterialCommunityIcons', color: '#4285F4', category: 'Productivity' },
  { slug: 'notion', name: 'Notion', iconName: 'note-text', iconFamily: 'MaterialCommunityIcons', color: '#000000', category: 'Productivity' },
  { slug: 'todoist', name: 'Todoist', iconName: 'checkbox-marked', iconFamily: 'MaterialCommunityIcons', color: '#E44332', category: 'Productivity' },
  { slug: 'trello', name: 'Trello', iconName: 'trello', iconFamily: 'MaterialCommunityIcons', color: '#0052CC', category: 'Productivity' },
  { slug: 'asana', name: 'Asana', iconName: 'checkbox-marked-circle', iconFamily: 'MaterialCommunityIcons', color: '#F06A6A', category: 'Productivity' },
  { slug: 'airtable', name: 'Airtable', iconName: 'table', iconFamily: 'MaterialCommunityIcons', color: '#18BFFF', category: 'Productivity' },
  { slug: 'clickup', name: 'ClickUp', iconName: 'checkbox-multiple-marked', iconFamily: 'MaterialCommunityIcons', color: '#7B68EE', category: 'Productivity' },
  { slug: 'monday', name: 'Monday', iconName: 'view-dashboard', iconFamily: 'MaterialCommunityIcons', color: '#FF3D57', category: 'Productivity' },
  { slug: 'evernote', name: 'Evernote', iconName: 'elephant', iconFamily: 'MaterialCommunityIcons', color: '#00A82D', category: 'Productivity' },
  { slug: 'basecamp', name: 'Basecamp', iconName: 'campfire', iconFamily: 'MaterialCommunityIcons', color: '#1D2D35', category: 'Productivity' },
  // Development
  { slug: 'github', name: 'GitHub', iconName: 'github', iconFamily: 'FontAwesome5', color: '#333333', category: 'Development' },
  { slug: 'linear', name: 'Linear', iconName: 'hexagon-outline', iconFamily: 'MaterialCommunityIcons', color: '#5E6AD2', category: 'Development' },
  { slug: 'jira', name: 'Jira', iconName: 'jira', iconFamily: 'MaterialCommunityIcons', color: '#0052CC', category: 'Development' },
  { slug: 'gitlab', name: 'GitLab', iconName: 'gitlab', iconFamily: 'FontAwesome5', color: '#FC6D26', category: 'Development' },
  { slug: 'bitbucket', name: 'Bitbucket', iconName: 'bitbucket', iconFamily: 'FontAwesome5', color: '#0052CC', category: 'Development' },
  { slug: 'vercel', name: 'Vercel', iconName: 'triangle', iconFamily: 'MaterialCommunityIcons', color: '#000000', category: 'Development' },
  { slug: 'netlify', name: 'Netlify', iconName: 'web', iconFamily: 'MaterialCommunityIcons', color: '#00C7B7', category: 'Development' },
  { slug: 'sentry', name: 'Sentry', iconName: 'bug-outline', iconFamily: 'MaterialCommunityIcons', color: '#362D59', category: 'Development' },
  { slug: 'docker', name: 'Docker', iconName: 'docker', iconFamily: 'FontAwesome5', color: '#2496ED', category: 'Development' },
  { slug: 'circleci', name: 'CircleCI', iconName: 'circle-slice-8', iconFamily: 'MaterialCommunityIcons', color: '#343434', category: 'Development' },
  // Cloud & Storage
  { slug: 'googledrive', name: 'Google Drive', iconName: 'google-drive', iconFamily: 'MaterialCommunityIcons', color: '#4285F4', category: 'Cloud & Storage' },
  { slug: 'dropbox', name: 'Dropbox', iconName: 'dropbox', iconFamily: 'MaterialCommunityIcons', color: '#0061FF', category: 'Cloud & Storage' },
  { slug: 'onedrive', name: 'OneDrive', iconName: 'microsoft-onedrive', iconFamily: 'MaterialCommunityIcons', color: '#0078D4', category: 'Cloud & Storage' },
  { slug: 'box', name: 'Box', iconName: 'package-variant', iconFamily: 'MaterialCommunityIcons', color: '#0061D5', category: 'Cloud & Storage' },
  { slug: 'googlesheets', name: 'Google Sheets', iconName: 'google-spreadsheet', iconFamily: 'MaterialCommunityIcons', color: '#0F9D58', category: 'Cloud & Storage' },
  { slug: 'googledocs', name: 'Google Docs', iconName: 'file-document', iconFamily: 'MaterialCommunityIcons', color: '#4285F4', category: 'Cloud & Storage' },
  // Entertainment & Media
  { slug: 'spotify', name: 'Spotify', iconName: 'spotify', iconFamily: 'FontAwesome5', color: '#1DB954', category: 'Entertainment & Media' },
  { slug: 'youtube', name: 'YouTube', iconName: 'youtube', iconFamily: 'FontAwesome5', color: '#FF0000', category: 'Entertainment & Media' },
  { slug: 'twitch', name: 'Twitch', iconName: 'twitch', iconFamily: 'FontAwesome5', color: '#9146FF', category: 'Entertainment & Media' },
  { slug: 'soundcloud', name: 'SoundCloud', iconName: 'soundcloud', iconFamily: 'FontAwesome5', color: '#FF5500', category: 'Entertainment & Media' },
  { slug: 'netflix', name: 'Netflix', iconName: 'netflix', iconFamily: 'MaterialCommunityIcons', color: '#E50914', category: 'Entertainment & Media' },
  // Finance
  { slug: 'stripe', name: 'Stripe', iconName: 'stripe', iconFamily: 'FontAwesome5', color: '#635BFF', category: 'Finance' },
  { slug: 'paypal', name: 'PayPal', iconName: 'paypal', iconFamily: 'FontAwesome5', color: '#00457C', category: 'Finance' },
  { slug: 'quickbooks', name: 'QuickBooks', iconName: 'calculator', iconFamily: 'MaterialCommunityIcons', color: '#2CA01C', category: 'Finance' },
  { slug: 'xero', name: 'Xero', iconName: 'currency-usd', iconFamily: 'MaterialCommunityIcons', color: '#13B5EA', category: 'Finance' },
  // CRM & Support
  { slug: 'salesforce', name: 'Salesforce', iconName: 'salesforce', iconFamily: 'FontAwesome5', color: '#00A1E0', category: 'CRM & Support' },
  { slug: 'hubspot', name: 'HubSpot', iconName: 'hubspot', iconFamily: 'FontAwesome5', color: '#FF7A59', category: 'CRM & Support' },
  { slug: 'pipedrive', name: 'Pipedrive', iconName: 'pipe', iconFamily: 'MaterialCommunityIcons', color: '#017737', category: 'CRM & Support' },
  { slug: 'freshdesk', name: 'Freshdesk', iconName: 'headphones', iconFamily: 'MaterialCommunityIcons', color: '#25C16F', category: 'CRM & Support' },
  { slug: 'zendesk', name: 'Zendesk', iconName: 'face-agent', iconFamily: 'MaterialCommunityIcons', color: '#03363D', category: 'CRM & Support' },
  { slug: 'intercom', name: 'Intercom', iconName: 'message-text', iconFamily: 'MaterialCommunityIcons', color: '#1F8DED', category: 'CRM & Support' },
  // Social
  { slug: 'twitter', name: 'Twitter/X', iconName: 'twitter', iconFamily: 'FontAwesome5', color: '#1DA1F2', category: 'Social' },
  { slug: 'linkedin', name: 'LinkedIn', iconName: 'linkedin', iconFamily: 'FontAwesome5', color: '#0A66C2', category: 'Social' },
  { slug: 'reddit', name: 'Reddit', iconName: 'reddit', iconFamily: 'FontAwesome5', color: '#FF4500', category: 'Social' },
  { slug: 'instagram', name: 'Instagram', iconName: 'instagram', iconFamily: 'FontAwesome5', color: '#E4405F', category: 'Social' },
  { slug: 'tiktok', name: 'TikTok', iconName: 'tiktok', iconFamily: 'FontAwesome5', color: '#000000', category: 'Social' },
  { slug: 'pinterest', name: 'Pinterest', iconName: 'pinterest', iconFamily: 'FontAwesome5', color: '#BD081C', category: 'Social' },
  { slug: 'snapchat', name: 'Snapchat', iconName: 'snapchat', iconFamily: 'FontAwesome5', color: '#FFFC00', category: 'Social' },
  { slug: 'mastodon', name: 'Mastodon', iconName: 'mastodon', iconFamily: 'FontAwesome5', color: '#6364FF', category: 'Social' },
  // Smart Home & IoT
  { slug: 'hue', name: 'Philips Hue', iconName: 'lightbulb', iconFamily: 'MaterialCommunityIcons', color: '#0065D3', category: 'Smart Home & IoT' },
  { slug: 'smartthings', name: 'SmartThings', iconName: 'home-automation', iconFamily: 'MaterialCommunityIcons', color: '#15BEF0', category: 'Smart Home & IoT' },
  { slug: 'ifttt', name: 'IFTTT', iconName: 'transit-connection-variant', iconFamily: 'MaterialCommunityIcons', color: '#000000', category: 'Smart Home & IoT' },
  // Email Marketing
  { slug: 'mailchimp', name: 'Mailchimp', iconName: 'mailchimp', iconFamily: 'FontAwesome5', color: '#FFE01B', category: 'Email Marketing' },
  { slug: 'sendgrid', name: 'SendGrid', iconName: 'email-fast', iconFamily: 'MaterialCommunityIcons', color: '#1A82E2', category: 'Email Marketing' },
  { slug: 'convertkit', name: 'ConvertKit', iconName: 'email-newsletter', iconFamily: 'MaterialCommunityIcons', color: '#FB6970', category: 'Email Marketing' },
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

    // Connect via OAuth — use single-use connect token (avoids JWT in URL)
    setConnectingSlug(slug);
    try {
      const { data } = await client.post<{ connectToken: string }>('/connect/create-connect-token', { app: slug });
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
  }, [connected, refetch]);

  const filtered = search
    ? KNOWN_APPS.filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    : KNOWN_APPS;

  const categories = [...new Set(filtered.map(a => a.category))];

  const CATEGORY_ICONS: Record<string, { icon: string; color: string }> = {
    Communication: { icon: '💬', color: '#4A7BD9' },
    Productivity: { icon: '⚡', color: '#F5A623' },
    Development: { icon: '🛠️', color: '#9B7EC8' },
    'Cloud & Storage': { icon: '☁️', color: '#6EC6B8' },
    'Entertainment & Media': { icon: '🎵', color: '#32D74B' },
    Finance: { icon: '💰', color: '#F5A623' },
    'CRM & Support': { icon: '🤝', color: '#4A7BD9' },
    Social: { icon: '🌐', color: '#9B7EC8' },
    'Smart Home & IoT': { icon: '🏠', color: '#15BEF0' },
    'Email Marketing': { icon: '📧', color: '#1A82E2' },
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
                          <AppIcon iconName={app.iconName} iconFamily={app.iconFamily} size={26} color={app.color} />
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
