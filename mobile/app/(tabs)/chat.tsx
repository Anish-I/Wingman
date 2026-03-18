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
  Animated,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import { colors, spacing, radius, shadows, fonts } from '../../src/theme';
import type { Message } from '../../src/types';

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingDots}>
      <Animated.View style={[styles.dot, { transform: [{ translateY: dot1 }] }]} />
      <Animated.View style={[styles.dot, { transform: [{ translateY: dot2 }] }]} />
      <Animated.View style={[styles.dot, { transform: [{ translateY: dot3 }] }]} />
    </View>
  );
}

function StatusRing({ size, children }: { size: number; children: React.ReactNode }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.8, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size + 8,
          height: size + 8,
          borderRadius: (size + 8) / 2,
          borderWidth: 2,
          borderColor: colors.teal,
          opacity: pulseAnim,
        }}
      />
      {children}
    </View>
  );
}

function AnimatedBubble({ children }: { children: React.ReactNode }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      {children}
    </Animated.View>
  );
}

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

  function handleChip(text: string) {
    if (loading) return;
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
        setMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
        }]);
      })
      .catch((err: unknown) => {
        setMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong.',
          timestamp: Date.now(),
        }]);
      })
      .finally(() => setLoading(false));
  }

  function renderItem({ item }: { item: Message }) {
    const isUser = item.role === 'user';
    return (
      <AnimatedBubble>
        <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
          {!isUser && (
            <StatusRing size={28}>
              <View style={styles.avatarContainer}>
                <Image
                  source={require('../../assets/pip/pip-icon.png')}
                  style={styles.avatar}
                />
              </View>
            </StatusRing>
          )}
          {isUser ? (
            <View style={[styles.bubble, styles.bubbleUser]}>
              <Text style={[styles.bubbleText, styles.bubbleTextUser]}>
                {item.content}
              </Text>
            </View>
          ) : (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <Text style={styles.bubbleText}>
                {item.content}
              </Text>
            </View>
          )}
        </View>
      </AnimatedBubble>
    );
  }

  const examplePrompts = [
    { text: 'Schedule a meeting', icon: 'calendar-outline' as const },
    { text: 'Check my calendar', icon: 'time-outline' as const },
    { text: 'Send an email', icon: 'mail-outline' as const },
    { text: 'Set a reminder', icon: 'alarm-outline' as const },
  ];

  const canSend = input.trim().length > 0 && !loading;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <StatusRing size={40}>
          <View style={styles.headerAvatar}>
            <Image
              source={require('../../assets/pip/pip-icon.png')}
              style={styles.headerAvatarImg}
            />
          </View>
        </StatusRing>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Pip</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Online</Text>
          </View>
        </View>
      </View>

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
          contentContainerStyle={[
            styles.list,
            messages.length === 0 && { flexGrow: 1, justifyContent: 'center' },
          ]}
          ListEmptyComponent={
            <View style={styles.welcome}>
              <View style={styles.welcomeAvatarGlow}>
                <View style={styles.welcomeAvatarRing}>
                  <Image
                    source={require('../../assets/pip/pip-happy.png')}
                    style={styles.welcomeAvatar}
                  />
                </View>
              </View>
              <Text style={styles.welcomeTitle}>What can I help with?</Text>
              <Text style={styles.welcomeSubtitle}>
                Your AI assistant. Try asking me something:
              </Text>
              <View style={styles.chipGrid}>
                {examplePrompts.map((prompt) => (
                  <TouchableOpacity
                    key={prompt.text}
                    style={styles.chip}
                    onPress={() => handleChip(prompt.text)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={prompt.icon} size={16} color={colors.teal} />
                    <Text style={styles.chipText}>{prompt.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />
        {loading && (
          <View style={styles.typingRow}>
            <TypingDots />
            <Text style={styles.typing}>Pip is thinking...</Text>
          </View>
        )}

        {/* Quick action chips (visible when there are messages) */}
        {messages.length > 0 && !loading && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionChipBar}
          >
            {examplePrompts.slice(0, 4).map((prompt) => (
              <TouchableOpacity
                key={prompt.text}
                style={styles.actionChip}
                onPress={() => handleChip(prompt.text)}
                activeOpacity={0.7}
              >
                <Ionicons name={prompt.icon} size={14} color={colors.primary} />
                <Text style={styles.actionChipText}>{prompt.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message Pip..."
            placeholderTextColor={colors.textMuted}
            multiline
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={send}
            disabled={!canSend}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.sendBtn,
                { backgroundColor: canSend ? colors.primary : colors.border },
              ]}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={canSend ? '#FFFFFF' : colors.textMuted}
              />
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  headerAvatarImg: { width: 40, height: 40 },
  headerInfo: { flex: 1 },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.bold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fonts.regular,
  },

  list: { padding: spacing.md, gap: 4 },

  // Messages
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginVertical: 3,
  },
  msgRowUser: { justifyContent: 'flex-end' },
  msgRowAssistant: { justifyContent: 'flex-start' },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  avatar: { width: 28, height: 28 },
  bubble: {
    maxWidth: '78%',
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: 'rgba(26, 26, 46, 0.7)',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },

  // Typing
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.teal,
  },
  typing: { color: colors.textMuted, fontSize: 13 },

  // Quick action chips bar
  actionChipBar: {
    paddingHorizontal: spacing.md,
    paddingRight: 16,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  actionChipText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '500',
  },

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.card,
    margin: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.regular,
    maxHeight: 120,
    paddingVertical: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Welcome
  welcome: { alignItems: 'center', paddingHorizontal: spacing.lg },
  welcomeAvatarGlow: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.accentGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  welcomeAvatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.teal,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    ...shadows.glow(colors.teal),
  },
  welcomeAvatar: { width: 80, height: 80 },
  welcomeTitle: {
    color: colors.text,
    fontSize: 24,
    fontFamily: fonts.extraBold,
    marginBottom: spacing.xs,
  },
  welcomeSubtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.glass,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
});
