import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { api } from '../../src/api';
import type { Message } from '../../src/types';

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const { reply } = await api.chat(userMsg.content);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong.',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  function renderItem({ item }: { item: Message }) {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && (
          <Image
            source={require('../../assets/pip/pip-happy.png')}
            style={styles.avatar}
          />
        )}
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={styles.bubbleText}>{item.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
        {loading && (
          <View style={styles.typingRow}>
            <Image
              source={require('../../assets/pip/pip-thinking.png')}
              style={styles.avatarSmall}
            />
            <Text style={styles.typing}>Pip is thinking\u2026</Text>
          </View>
        )}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Wingman\u2026"
            placeholderTextColor="#555"
            multiline
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={loading}>
            <Text style={styles.sendText}>{'\u2191'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  flex: { flex: 1 },
  list: { padding: 16, gap: 12 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarSmall: { width: 24, height: 24 },
  bubble: { maxWidth: '75%', borderRadius: 18, padding: 12 },
  bubbleUser: { backgroundColor: '#6c63ff', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#1a1a2e', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#e0e0ff', fontSize: 15, lineHeight: 22 },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  typing: { color: '#555', fontSize: 13 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1a1a2e',
    margin: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  input: { flex: 1, color: '#e0e0ff', fontSize: 15, maxHeight: 120 },
  sendBtn: {
    backgroundColor: '#6c63ff',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 },
});
