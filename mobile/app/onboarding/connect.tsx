import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import PipCard from '../../src/PipCard';

const FIRST_APPS = [
  { slug: 'gmail', name: 'Gmail', emoji: '\u{1F4E7}' },
  { slug: 'googlecalendar', name: 'Calendar', emoji: '\u{1F4C5}' },
  { slug: 'slack', name: 'Slack', emoji: '\u{1F4AC}' },
  { slug: 'github', name: 'GitHub', emoji: '\u{1F419}' },
  { slug: 'notion', name: 'Notion', emoji: '\u{1F4DD}' },
];

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function ConnectScreen() {
  const router = useRouter();
  const [connected, setConnected] = useState<string[]>([]);
  const [pipMessage, setPipMessage] = useState(
    "You're in! Now let's\nconnect your first app.\nI'll do the rest."
  );
  const [pipExpression, setPipExpression] = useState<'excited' | 'happy'>('excited');

  async function handleConnect(slug: string) {
    const result = await WebBrowser.openAuthSessionAsync(
      `${BASE}/connect/${slug}`,
      'wingman://connect/callback'
    );
    if (result.type === 'success') {
      setConnected((prev) => [...prev, slug]);
      const app = FIRST_APPS.find((a) => a.slug === slug);
      setPipMessage(`Nice! ${app?.name} connected.\nText me anytime \u2014\nI'm always watching \u{1F440}`);
      setPipExpression('happy');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <PipCard expression={pipExpression} message={pipMessage} />
        <FlatList
          data={FIRST_APPS}
          numColumns={3}
          keyExtractor={(item) => item.slug}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.appBtn, connected.includes(item.slug) && styles.appBtnConnected]}
              onPress={() => handleConnect(item.slug)}
            >
              <Text style={styles.appEmoji}>{item.emoji}</Text>
              <Text style={styles.appName}>{item.name}</Text>
              {connected.includes(item.slug) && <Text style={styles.check}>{'\u2713'}</Text>}
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(tabs)/chat')}
        >
          <Text style={styles.buttonText}>
            {connected.length > 0 ? 'Go to chat \u2192' : 'Skip \u2192'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
  grid: { paddingVertical: 24, gap: 12 },
  appBtn: {
    flex: 1,
    margin: 6,
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    minWidth: 90,
  },
  appBtnConnected: { borderWidth: 1.5, borderColor: '#6c63ff' },
  appEmoji: { fontSize: 28, marginBottom: 6 },
  appName: { color: '#e0e0ff', fontSize: 12, fontWeight: '500' },
  check: { color: '#6c63ff', fontSize: 16, marginTop: 4, fontWeight: '700' },
  button: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
