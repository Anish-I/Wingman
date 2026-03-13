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
import { colors } from '../../src/theme';
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

  function handleChip(text: string) {
    setInput(text);
    // Send after state update via a microtask
    setTimeout(() => {
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      api.chat(text)
        .then(({ reply }) => {
          const assistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: reply,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        })
        .catch((err: unknown) => {
          const errMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: err instanceof Error ? err.message : 'Something went wrong.',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, errMsg]);
        })
        .finally(() => setLoading(false));
    }, 0);
  }

  const examplePrompts = ['Send an email', 'Check my calendar', 'Set a reminder'];

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
          contentContainerStyle={[styles.list, messages.length === 0 && { flexGrow: 1, justifyContent: 'center' }]}
          ListEmptyComponent={
            <View style={styles.welcome}>
              <Image
                source={require('../../assets/pip/pip-wave.png')}
                style={styles.welcomeAvatar}
              />
              <Text style={styles.welcomeText}>Hey! I'm Pip. Try asking me something:</Text>
              <View style={styles.chipRow}>
                {examplePrompts.map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={styles.chip}
                    onPress={() => handleChip(prompt)}
                  >
                    <Text style={styles.chipText}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />
        {loading && (
          <View style={styles.typingRow}>
            <Image
              source={require('../../assets/pip/pip-thinking.png')}
              style={styles.avatarSmall}
            />
            <Text style={styles.typing}>Pip is thinking...</Text>
          </View>
        )}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Wingman..."
            placeholderTextColor={colors.textMuted}
            multiline
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, { opacity: !input.trim() || loading ? 0.4 : 1 }]}
            onPress={send}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendText}>{'\u2191'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { padding: 16, gap: 12 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarSmall: { width: 24, height: 24 },
  bubble: { maxWidth: '75%', borderRadius: 18, padding: 12 },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: colors.card, borderBottomLeftRadius: 4 },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  typing: { color: colors.textMuted, fontSize: 13 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    margin: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, maxHeight: 120 },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: -2 },
  welcome: { alignItems: 'center', paddingHorizontal: 24 },
  welcomeAvatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 16 },
  welcomeText: { color: colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  chip: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
});
