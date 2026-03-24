import type { Message } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import Env from 'env';
import { MotiView } from 'moti';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useResponsive } from '@/lib/responsive';
import { SafeAreaView } from 'react-native-safe-area-context';
import { base, blue, purple, semantic, teal, useThemeColors } from '@/components/ui/tokens';
import { useSendMessage } from '@/features/chat/api';
import { useChatStore } from '@/features/chat/store';
import { springs, popIn, entrance, chipPressStyle, cardPressStyle, sendButtonAnimate, webInteractive, gentleFloat, useReducedMotion, maybeReduce } from '@/lib/motion';

const IS_STUB = !Env.EXPO_PUBLIC_API_URL || Env.EXPO_PUBLIC_API_URL === 'http://localhost:3001';

const PIP_GREETINGS = [
  'Ask me anything! I love helping.',
  'Ready when you are! What\'s up?',
  'Coo! Let\'s get things done.',
  'Your personal pigeon, at your service!',
];

function TypingDots({ reducedMotion }: { reducedMotion?: boolean }) {
  const { surface } = useThemeColors();
  return (
    <View className="flex-row items-center gap-1.5 px-4 pb-3">
      <MotiView
        {...maybeReduce({
          from: { scale: 0.8, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          transition: { type: 'spring' as const, damping: 12 },
        }, !!reducedMotion)}
        className="flex-row items-center gap-2 rounded-2xl rounded-bl-[4px] px-4 py-3"
        style={{ backgroundColor: surface.card }}
      >
        {[0, 1, 2].map(i => (
          <MotiView
            key={i}
            {...maybeReduce({
              from: { translateY: 0, scale: 1 },
              animate: { translateY: -5, scale: 1.2 },
              transition: {
                type: 'timing' as const,
                duration: 350,
                loop: true,
                repeatReverse: true,
                delay: i * 120,
              },
            }, !!reducedMotion)}
            style={styles.typingDot}
          />
        ))}
      </MotiView>
      <Text style={styles.typingLabel}>
        Pip is thinking...
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const { surface, text: t } = useThemeColors();
  const { chatMaxWidth } = useResponsive();
  const reducedMotion = useReducedMotion();
  const messages = useChatStore.use.messages();
  const loading = useChatStore.use.loading();
  const addMessage = useChatStore.use.addMessage();
  const updateMessage = useChatStore.use.updateMessage();
  const setLoading = useChatStore.use.setLoading();
  const [input, setInput] = useState('');
  const [greeting] = useState(() => PIP_GREETINGS[Math.floor(Math.random() * PIP_GREETINGS.length)]);
  const listRef = useRef<FlatList>(null);
  const sendMutation = useSendMessage();

  // Theme-dependent styles
  const s = React.useMemo(() => ({
    safeArea: { flex: 1, backgroundColor: surface.bg } as const,
    headerBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: surface.bg,
      borderBottomWidth: 1,
      borderBottomColor: surface.border,
      gap: 12,
    },
    headerAvatar: {
      backgroundColor: surface.card,
      borderWidth: 1.5,
      borderColor: purple.muted,
    },
    headerName: { color: t.primary, fontSize: 18, fontFamily: 'Sora_700Bold' as const },
    headerOnline: { color: teal[200], fontSize: 12, fontFamily: 'Inter_500Medium' as const },
    typingDotsContainer: { backgroundColor: surface.card },
    messageAvatarBg: { backgroundColor: surface.card },
    messageBubbleAssistant: {
      backgroundColor: surface.card,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: surface.border,
    },
    messageTextUser: { fontSize: 15, lineHeight: 22, color: base.white },
    messageTextAssistant: { fontSize: 15, lineHeight: 22, color: t.primary },
    statusSending: { fontSize: 11, color: t.muted, fontFamily: 'Inter_500Medium' as const },
    emptyTitle: {
      color: t.primary,
      fontSize: 24,
      fontFamily: 'Sora_700Bold' as const,
      textAlign: 'center' as const,
      marginBottom: 4,
    },
    emptySubtitle: {
      color: t.secondary,
      fontSize: 15,
      textAlign: 'center' as const,
      marginBottom: 8,
      lineHeight: 22,
    },
    tryAskingLabel: {
      color: t.muted,
      fontSize: 11,
      fontFamily: 'Inter_600SemiBold' as const,
      letterSpacing: 1.5,
      textAlign: 'center' as const,
      marginBottom: 4,
    },
    promptChipBase: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      backgroundColor: surface.card,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: surface.border,
    },
    promptChipText: { color: t.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold' as const },
    emptyAvatarBorder: {
      backgroundColor: surface.card,
      borderWidth: 2,
      borderColor: purple.muted,
    },
    inputBar: {
      flexDirection: 'row' as const,
      alignItems: 'flex-end' as const,
      backgroundColor: surface.card,
      margin: 12,
      marginBottom: 16,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 8,
      gap: 8,
      borderWidth: 1.5,
      borderColor: surface.border,
    },
    textInputColor: { maxHeight: 120, color: t.primary },
    sendButtonActive: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: purple[500],
    },
    sendButtonInactive: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: surface.elevated,
    },
  }), [surface, t]);

  // Hard mutex — refs update synchronously across renders, so two rapid
  // invocations before re-render cannot both pass the guard.
  const isSendingRef = useRef(false);

  // Stable message IDs for dedup — survives retries without generating new UUIDs each call
  const pendingUserMsgId = useRef<string | null>(null);
  const pendingAssistantMsgId = useRef<string | null>(null);
  const lastFailedMsgRef = useRef<string | null>(null);

  async function send(text?: string) {
    if (isSendingRef.current) return; // Hard mutex — no double sends
    const msg = text ?? input.trim();
    if (!msg || loading)
      return;

    isSendingRef.current = true;

    // Reuse pending IDs on retry; only generate fresh ones for new messages
    if (!pendingUserMsgId.current) {
      pendingUserMsgId.current = Crypto.randomUUID();
    }
    if (!pendingAssistantMsgId.current) {
      pendingAssistantMsgId.current = Crypto.randomUUID();
    }
    const userMsgId = pendingUserMsgId.current;
    const assistantMsgId = pendingAssistantMsgId.current;

    // Deduplicate: skip if user message was already added (e.g. retry path)
    const currentMessages = useChatStore.getState().messages;
    if (currentMessages.some(m => m.id === userMsgId)) {
      // Already added — update status back to sending for retry
      updateMessage(userMsgId, { status: 'sending' });
    } else {
      const userMsg: Message = {
        id: userMsgId,
        role: 'user',
        content: msg,
        timestamp: Date.now(),
        status: 'sending',
      };
      addMessage(userMsg);
    }

    setInput('');
    Keyboard.dismiss();
    setLoading(true);
    try {
      const result = await sendMutation.mutateAsync({ message: msg });
      // Mark user message as sent
      updateMessage(userMsgId, { status: 'sent' });
      // Fresh snapshot from store to avoid stale closure
      const freshMessages = useChatStore.getState().messages;
      if (!freshMessages.some(m => m.id === assistantMsgId)) {
        addMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: result.reply,
          timestamp: Date.now(),
        });
      }
      // Success — clear pending IDs so next send generates fresh ones
      pendingUserMsgId.current = null;
      pendingAssistantMsgId.current = null;
    }
    catch (err: unknown) {
      // Mark user message as failed
      updateMessage(userMsgId, { status: 'failed' });
      // Fresh snapshot from store to avoid stale closure
      const freshMessages = useChatStore.getState().messages;
      if (!freshMessages.some(m => m.id === assistantMsgId)) {
        addMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Something went wrong.',
          timestamp: Date.now(),
        });
      }
      // Keep pending IDs on failure so retry reuses them
      lastFailedMsgRef.current = msg;
    }
    finally {
      setLoading(false);
      isSendingRef.current = false;
    }
  }

  function retry(messageId: string) {
    const msg = useChatStore.getState().messages.find(m => m.id === messageId);
    if (!msg || msg.status !== 'failed') return;
    // Remove the error assistant message that followed the failed user message
    const msgs = useChatStore.getState().messages;
    const failedIdx = msgs.findIndex(m => m.id === messageId);
    if (failedIdx >= 0 && failedIdx + 1 < msgs.length && msgs[failedIdx + 1].role === 'assistant') {
      const errorMsgId = msgs[failedIdx + 1].id;
      useChatStore.setState((state) => ({
        messages: state.messages.filter(m => m.id !== errorMsgId),
      }));
      // Reset assistant ID so a new one is generated
      pendingAssistantMsgId.current = null;
    }
    // Reuse the same user message ID for retry
    pendingUserMsgId.current = messageId;
    send(msg.content);
  }

  useEffect(() => {
    if (messages.length)
      listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const examplePrompts = [
    { text: 'Schedule a meeting', icon: 'calendar-outline' as const, color: '#F5A623' },
    { text: 'Send an email', icon: 'mail-outline' as const, color: blue[400] },
    { text: 'Play music', icon: 'musical-notes-outline' as const, color: purple[400] },
    { text: 'Check my tasks', icon: 'checkmark-circle-outline' as const, color: teal[300] },
    { text: 'What can you do?', icon: 'sparkles-outline' as const, color: purple[500] },
  ];

  const canSend = input.trim().length > 0 && !loading;
  const [inputFocused, setInputFocused] = useState(false);

  // Keep a ref to the latest send function to avoid stale closures in the
  // web-only keypress handler.
  const sendRef = useRef(send);
  sendRef.current = send;

  // On web, multiline TextInput's onSubmitEditing doesn't fire.
  // Handle Enter key (without Shift) to send.
  const handleKeyPress = useCallback(
    (e: any) => {
      if (Platform.OS !== 'web')
        return;
      if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
        e.preventDefault();
        // Also prevent on the native DOM event in case the RN wrapper doesn't propagate
        e.nativeEvent.preventDefault?.();
        sendRef.current();
      }
    },
    [],
  );

  function renderItem({ item, index }: { item: Message; index: number }) {
    const isUser = item.role === 'user';
    const status = item.status;
    const isFailed = status === 'failed';
    return (
      <MotiView
        {...maybeReduce({
          from: { opacity: 0, translateY: 12, scale: 0.95 },
          animate: { opacity: 1, translateY: 0, scale: 1 },
          transition: { ...springs.snappy, delay: 50 },
        }, reducedMotion)}
      >
        <View className={`my-0.5 flex-row items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          {!isUser && (
            <MotiView
              {...maybeReduce(popIn(0, 50), reducedMotion)}
              className="size-7 items-center justify-center overflow-hidden rounded-full"
              style={s.messageAvatarBg}
            >
              <Image source={require('../../../assets/pip/pip-happy.png')} style={styles.messageAvatarImage} />
            </MotiView>
          )}
          <View style={{ maxWidth: chatMaxWidth }}>
            <View
              style={[
                styles.messageBubbleBase,
                isUser
                  ? {
                      backgroundColor: isFailed ? '#7C3AED80' : purple[500],
                      borderBottomRightRadius: 4,
                    }
                  : s.messageBubbleAssistant,
              ]}
            >
              <Text style={isUser ? s.messageTextUser : s.messageTextAssistant}>
                {item.content}
              </Text>
            </View>
            {isUser && status && (
              <View style={styles.statusRow}>
                {status === 'sending' && (
                  <Text style={s.statusSending}>Sending…</Text>
                )}
                {status === 'sent' && (
                  <View style={styles.statusSentRow}>
                    <Ionicons name="checkmark-done-outline" size={13} color={teal[200]} />
                    <Text style={styles.statusSentText}>Sent</Text>
                  </View>
                )}
                {isFailed && (
                  <View style={styles.statusFailedRow}>
                    <Ionicons name="alert-circle-outline" size={13} color={semantic.error} />
                    <Text style={styles.statusFailedText}>Failed</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry sending message"
                      onPress={() => retry(item.id)}
                      hitSlop={12}
                      style={styles.retryButton}
                    >
                      <Ionicons name="refresh-outline" size={13} color={purple[400]} />
                      <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </MotiView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      {/* Header */}
      <MotiView
        {...maybeReduce({
          from: { opacity: 0, translateY: -8 },
          animate: { opacity: 1, translateY: 0 },
          transition: springs.gentle,
        }, reducedMotion)}
        style={s.headerBar}
      >
        <MotiView
          {...maybeReduce({
            from: { rotate: '0deg' },
            animate: { rotate: '0deg' },
          }, reducedMotion)}
          className="size-11 items-center justify-center overflow-hidden rounded-full"
          style={s.headerAvatar}
        >
          <Image source={require('../../../assets/pip/pip-happy.png')} style={styles.headerAvatarImage} />
        </MotiView>
        <View style={styles.flex1}>
          <View style={styles.headerNameRow}>
            <Text style={s.headerName}>Pip</Text>
            <View style={styles.onlineDot} />
          </View>
          <Text style={s.headerOnline}>
            Online
          </Text>
        </View>
        {IS_STUB && (
          <View style={styles.demoBadge}>
            <Text style={styles.demoBadgeText}>DEMO</Text>
          </View>
        )}
      </MotiView>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderItem}
          contentContainerClassName="p-4 gap-1"
          contentContainerStyle={messages.length === 0 ? styles.emptyContentContainer : undefined}
          ListEmptyComponent={(
            <View className="items-center px-6">
              {/* Pip avatar — floats gently to feel alive */}
              <MotiView
                {...maybeReduce(popIn(0, 200), reducedMotion)}
              >
                <MotiView {...maybeReduce(gentleFloat(800), reducedMotion)}>
                  <View
                    style={[styles.emptyAvatar, s.emptyAvatarBorder]}
                  >
                    <Image source={require('../../../assets/pip/pip-wave.png')} style={styles.emptyAvatarImage} />
                  </View>
                </MotiView>
              </MotiView>

              <MotiView
                {...maybeReduce(entrance(0, 400), reducedMotion)}
              >
                <Text style={s.emptyTitle}>
                  Hey! I'm Pip
                </Text>
                <Text style={s.emptySubtitle}>
                  {greeting}
                </Text>
              </MotiView>

              {/* Prompt suggestions */}
              <MotiView
                {...maybeReduce(entrance(0, 550), reducedMotion)}
                className="mt-4 w-full"
                style={styles.promptSuggestionsGap}
              >
                <Text style={s.tryAskingLabel}>
                  TRY ASKING
                </Text>
                <View className="flex-row flex-wrap justify-center gap-2">
                  {examplePrompts.map((prompt, i) => (
                    <MotiView
                      key={prompt.text}
                      {...maybeReduce(popIn(i, 650), reducedMotion)}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={prompt.text}
                        accessibilityHint="Double tap to send this message"
                        style={({ pressed, hovered, focused }: any) => [
                          s.promptChipBase,
                          ...cardPressStyle({ pressed }),
                          webInteractive(),
                          Platform.OS === 'web' && hovered && !pressed
                            ? { borderColor: `${prompt.color}60`, boxShadow: `0 4px 16px ${prompt.color}28`, transform: [{ scale: 1.02 }] } as any
                            : undefined,
                          Platform.OS === 'web' && focused
                            ? { boxShadow: `0 0 0 2px ${prompt.color}40` } as any
                            : undefined,
                        ]}
                        onPress={() => send(prompt.text)}
                      >
                        <View
                          style={[styles.promptIconContainer, { backgroundColor: `${prompt.color}18` }]}
                        >
                          <Ionicons name={prompt.icon} size={15} color={prompt.color} />
                        </View>
                        <Text style={s.promptChipText}>
                          {prompt.text}
                        </Text>
                      </Pressable>
                    </MotiView>
                  ))}
                </View>
              </MotiView>
            </View>
          )}
        />

        {loading && <TypingDots reducedMotion={reducedMotion} />}

        {/* Input bar */}
        <MotiView
          {...maybeReduce(entrance(0, 200), reducedMotion)}
        >
          <MotiView
            {...maybeReduce({
              animate: {
                borderColor: inputFocused ? purple[500] : surface.border,
                backgroundColor: inputFocused ? `${purple[500]}08` : surface.card,
              },
              transition: { type: 'timing' as const, duration: 160 },
            }, reducedMotion)}
            style={s.inputBar}
          >
            <TextInput
              className="flex-1 py-1.5 text-[15px]"
              style={s.textInputColor}
              value={input}
              onChangeText={setInput}
              placeholder="Text Pip..."
              placeholderTextColor={t.muted}
              multiline
              onSubmitEditing={() => send()}
              onKeyPress={handleKeyPress}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              returnKeyType="send"
            />
            <MotiView
              {...maybeReduce(sendButtonAnimate(canSend), reducedMotion)}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityState={{ disabled: !canSend }}
                style={({ pressed, hovered, focused }: any) => [
                  canSend ? s.sendButtonActive : s.sendButtonInactive,
                  canSend && pressed ? styles.sendButtonPressed : undefined,
                  canSend && hovered && !pressed
                    ? { boxShadow: `0 4px 12px ${purple[500]}40`, transform: [{ scale: 1.05 }] } as any
                    : undefined,
                  canSend && focused
                    ? { boxShadow: `0 0 0 2px ${purple[500]}60` } as any
                    : undefined,
                  webInteractive(!canSend),
                ]}
                onPress={() => send()}
                disabled={!canSend}
              >
                <Ionicons name="arrow-up" size={20} color={canSend ? base.white : t.muted} />
              </Pressable>
            </MotiView>
          </MotiView>
        </MotiView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: teal[200],
  },
  typingLabel: {
    color: teal[200],
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 4,
  },
  messageAvatarImage: {
    width: 32,
    height: 32,
    resizeMode: 'cover',
  },
  messageBubbleBase: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 3,
    gap: 4,
  },
  statusSentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statusSentText: {
    fontSize: 11,
    color: teal[200],
    fontFamily: 'Inter_500Medium',
  },
  statusFailedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusFailedText: {
    fontSize: 11,
    color: semantic.error,
    fontFamily: 'Inter_500Medium',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 4,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 11,
    color: purple[400],
    fontFamily: 'Inter_600SemiBold',
  },
  headerAvatarImage: {
    width: 48,
    height: 48,
    resizeMode: 'cover',
  },
  flex1: {
    flex: 1,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: semantic.success,
  },
  demoBadge: {
    backgroundColor: '#F5A62318',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  demoBadgeText: {
    color: '#F5A623',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  emptyContentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  emptyAvatarImage: {
    width: 110,
    height: 110,
    resizeMode: 'cover',
  },
  promptSuggestionsGap: {
    gap: 8,
  },
  promptIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.85 }],
  },
});
