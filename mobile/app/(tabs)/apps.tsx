import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import PipCard from '../../src/PipCard';
import { api } from '../../src/api';

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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color="#6c63ff" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <PipCard
        expression="happy"
        message={"Connect your tools\nand I'll do the work."}
        style={styles.pip}
      />
      <FlatList
        data={KNOWN_APPS}
        numColumns={3}
        keyExtractor={(item) => item.slug}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const isConnected = connected.includes(item.slug);
          return (
            <TouchableOpacity
              style={[styles.appBtn, isConnected && styles.appBtnConnected]}
              onPress={() => !isConnected && handleConnect(item.slug)}
            >
              <Text style={styles.emoji}>{item.emoji}</Text>
              <Text style={styles.name}>{item.name}</Text>
              {isConnected && <Text style={styles.check}>{'\u2713'}</Text>}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  pip: { marginHorizontal: 16, marginTop: 8 },
  grid: { padding: 12, gap: 8 },
  appBtn: {
    flex: 1,
    margin: 6,
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    minWidth: 90,
  },
  appBtnConnected: { borderWidth: 1.5, borderColor: '#6c63ff' },
  emoji: { fontSize: 26, marginBottom: 6 },
  name: { color: '#e0e0ff', fontSize: 11, fontWeight: '500', textAlign: 'center' },
  check: { color: '#6c63ff', fontSize: 14, marginTop: 4, fontWeight: '700' },
});
