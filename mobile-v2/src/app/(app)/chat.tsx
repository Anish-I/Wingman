import type { Message } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import Env from 'env';
import { MotiView } from 'moti';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useResponsive } from '@/lib/responsive';
import { SafeAreaView } from 'react-native-safe-area-context';
import { base, blue, layout, purple, radii, semantic, spacing, teal, useThemeColors } from '@/components/ui/tokens';
import { useSendMessage } from '@/features/chat/api';
import { useChatStore, getIdempotencyKey, setIdempotencyKey, deleteIdempotencyKey, trackFailedContent, getFailedContentKey, clearFailedContent } from '@/features/chat/store';
import { springs, delays, staggerDelay, popIn, entrance, chipPressStyle, cardPressStyle, sendButtonAnimate, webInteractive, gentleFloat, useReducedMotion, maybeReduce } from '@/lib/motion';

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
    <View
      className="flex-row items-center"
      style={{ gap: spacing.xsPlus, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}
      accessibilityLiveRegion="polite"
      accessibilityLabel="Pip is thinking"
    >
      <MotiView
        {...maybeReduce({
          from: { scale: 0.8, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          transition: springs.gentle,
        }, !!reducedMotion)}
        className="flex-row items-center rounded-2xl rounded-bl-[4px]"
        style={[styles.typingDotsContainer, { backgroundColor: surface.card, gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }]}
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
                delay: staggerDelay(i, delays.normal),
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
  const dismissFailedMessage = useChatStore.use.dismissFailedMessage();
  const [input, setInput] = useState('');
  const [greeting] = useState(() => PIP_GREETINGS[Math.floor(Math.random() * PIP_GREETINGS.length)]);
  const listRef = useRef<FlatList>(null);
  const sendMutation = useSendMessage();

  // Theme-dependent overrides (static layout lives in StyleSheet below)
  const s = React.useMemo(() => ({
    safeArea: [styles.safeArea, { backgroundColor: surface.bg }],
    headerBar: [styles.headerBar, { backgroundColor: surface.bg, borderBottomColor: surface.border }],
    headerAvatar: [styles.headerAvatarBorder, { backgroundColor: surface.card, borderColor: purple.muted }],
    headerName: [styles.headerName, { color: t.primary }],
    headerOnline: [styles.headerOnline, { color: teal[200] }],
    messageAvatarBg: { backgroundColor: surface.card },
    messageBubbleAssistant: [styles.messageBubbleAssistant, { backgroundColor: surface.card, borderColor: surface.border }],
    messageTextUser: [styles.messageText, { color: base.white }],
    messageTextAssistant: [styles.messageText, { color: t.primary }],
    statusSending: [styles.statusSending, { color: t.muted }],
    emptyTitle: [styles.emptyTitle, { color: t.primary }],
    emptySubtitle: [styles.emptySubtitle, { color: t.secondary }],
    tryAskingLabel: [styles.tryAskingLabel, { color: t.muted }],
    promptChipBase: [styles.promptChipBase, { backgroundColor: surface.card, borderColor: surface.border }],
    promptChipText: [styles.promptChipText, { color: t.primary }],
    emptyAvatarBorder: [styles.emptyAvatarBorder, { backgroundColor: surface.card, borderColor: purple.muted }],
    inputBar: [styles.inputBar, { backgroundColor: surface.card, borderColor: surface.border }],
    textInputColor: [styles.textInputBase, { color: t.primary }],
    sendButtonActive: [styles.sendButton, { backgroundColor: purple[500] }],
    sendButtonInactive: [styles.sendButton, { backgroundColor: surface.elevated }],
  }), [surface, t]);

  // Hard mutex — refs update synchronously across renders, so two rapid
  // invocations before re-render cannot both pass the guard.
  const isSendingRef = useRef(false);

  // Stable message IDs for dedup — survives retries without generating new UUIDs each call
  const pendingUserMsgId = useRef<string | null>(null);
  const pendingAssistantMsgId = useRef<string | null>(null);
  const pendingIdempotencyKey = useRef<string | null>(null);
  const lastFailedMsgRef = useRef<string | null>(null);
  // AbortController for cancelling in-flight sends on navigation
  const abortRef = useRef<AbortController | null>(null);
  // Guard against late-arriving failures adding messages after navigation blur
  const mountedRef = useRef(true);
  // Auto-dismiss timers for failed messages — cleaned up on blur/unmount
  const autoDismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Reset pending refs when a failed message is dismissed so the next send
   *  generates fresh IDs/keys instead of reusing stale ones. */
  function clearPendingForMessage(messageId: string) {
    // Clear failed-content tracking so a fresh send of the same text isn't
    // deduplicated against the dismissed failure.
    const msg = useChatStore.getState().messages.find(m => m.id === messageId);
    if (msg) clearFailedContent(msg.content);
    if (pendingUserMsgId.current === messageId) {
      pendingUserMsgId.current = null;
      pendingAssistantMsgId.current = null;
      pendingIdempotencyKey.current = null;
    }
    deleteIdempotencyKey(messageId);
  }

  async function send(text?: string, isRetry = false) {
    if (isSendingRef.current) return; // Hard mutex — no double sends
    const msg = text ?? input.trim();
    if (!msg || loading)
      return;

    isSendingRef.current = true;

    // If pending refs point to a message that was already purged by background
    // cleanup or is still in the store as failed, clear them so we generate
    // fresh IDs/keys.  Without this, a new send could reuse a stale idempotency
    // key and the server might return a cached response from the prior attempt.
    if (!isRetry && pendingUserMsgId.current) {
      const stale = useChatStore.getState().messages.find(
        m => m.id === pendingUserMsgId.current
      );
      if (!stale || stale.status === 'failed') {
        const staleId = pendingUserMsgId.current;
        const timer = autoDismissTimers.current.get(staleId);
        if (timer) { clearTimeout(timer); autoDismissTimers.current.delete(staleId); }
        if (stale) useChatStore.getState().dismissFailedMessage(staleId);
        clearPendingForMessage(staleId);
      }
    }

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // Reuse pending IDs on retry; only generate fresh ones for new messages
    if (!pendingUserMsgId.current) {
      pendingUserMsgId.current = Crypto.randomUUID();
    }
    if (!pendingAssistantMsgId.current) {
      pendingAssistantMsgId.current = Crypto.randomUUID();
    } else if (isRetry) {
      // On retry, the old assistant ID may already be in the store as an error
      // message. Remove it and generate a fresh ID so the success response
      // isn't skipped by the duplicate-ID check.
      const existing = useChatStore.getState().messages.find(m => m.id === pendingAssistantMsgId.current);
      if (existing) {
        useChatStore.getState().removeMessage(pendingAssistantMsgId.current!);
        pendingAssistantMsgId.current = Crypto.randomUUID();
      }
    }
    // Stable idempotency key per message attempt — retries reuse the same key
    // to prevent server-side duplicates when API partially succeeds.
    // For retries without a stored key, omit the header so the server falls back
    // to its sha256(message) content-hash dedup, preventing duplicates even when
    // the original client key was lost (e.g. after navigation).
    if (!pendingIdempotencyKey.current && !isRetry) {
      // If this content previously failed (possibly partially succeeded server-side),
      // reuse the original key so the server deduplicates against the first attempt.
      const failedKey = getFailedContentKey(msg);
      if (failedKey) {
        pendingIdempotencyKey.current = failedKey;
      } else {
        pendingIdempotencyKey.current = `${Date.now()}-${pendingUserMsgId.current}`;
      }
    }
    const userMsgId = pendingUserMsgId.current;
    const assistantMsgId = pendingAssistantMsgId.current;
    const idempotencyKey = pendingIdempotencyKey.current;
    // Persist key in module-level store so it survives component remount/navigation
    if (idempotencyKey) setIdempotencyKey(userMsgId, idempotencyKey);

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
      const result = await sendMutation.mutateAsync({ message: msg, idempotencyKey, signal });
      // If user navigated away while the request was in-flight, the blur
      // handler already ran removeTransientMessages.  Adding messages now
      // would create orphans that never get cleaned up.
      if (!mountedRef.current) {
        pendingUserMsgId.current = null;
        pendingAssistantMsgId.current = null;
        pendingIdempotencyKey.current = null;
        deleteIdempotencyKey(userMsgId);
        return;
      }
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
      pendingIdempotencyKey.current = null;
      deleteIdempotencyKey(userMsgId);
      clearFailedContent(msg);
      // Auto-purge any lingering failed messages + error replies from prior attempts
      useChatStore.getState().purgeFailedMessages();
    }
    catch (err: unknown) {
      // If aborted (navigation away) or component unmounted, roll back entirely —
      // prevents orphaned failed/error messages from accumulating in the store.
      if (signal.aborted || !mountedRef.current) {
        useChatStore.getState().removeMessage(userMsgId);
        pendingUserMsgId.current = null;
        pendingAssistantMsgId.current = null;
        pendingIdempotencyKey.current = null;
        // Idempotency key is preserved in module-level storage — survives
        // navigation so retries reuse the same key to prevent duplicates.
        return;
      }
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
          isError: true,
        });
      }
      // Keep pending IDs on failure so retry reuses them
      lastFailedMsgRef.current = msg;
      // Track content → key mapping so re-sending the same content after
      // navigation reuses the original key, preventing server-side duplicates
      // when the first attempt partially succeeded (saved but response lost).
      if (idempotencyKey) trackFailedContent(msg, idempotencyKey);
      // Auto-dismiss failed message after 30 seconds if user doesn't interact
      const timerId = setTimeout(() => {
        autoDismissTimers.current.delete(userMsgId);
        if (mountedRef.current) {
          useChatStore.getState().dismissFailedMessage(userMsgId);
          clearPendingForMessage(userMsgId);
        }
      }, 30_000);
      autoDismissTimers.current.set(userMsgId, timerId);
    }
    finally {
      setLoading(false);
      isSendingRef.current = false;
    }
  }

  function retry(messageId: string) {
    const msg = useChatStore.getState().messages.find(m => m.id === messageId);
    if (!msg || msg.status !== 'failed') return;
    // Cancel auto-dismiss timer since user chose to retry
    const timer = autoDismissTimers.current.get(messageId);
    if (timer) { clearTimeout(timer); autoDismissTimers.current.delete(messageId); }
    // Remove the error assistant message that followed the failed user message
    const msgs = useChatStore.getState().messages;
    const failedIdx = msgs.findIndex(m => m.id === messageId);
    if (failedIdx >= 0 && failedIdx + 1 < msgs.length) {
      const next = msgs[failedIdx + 1];
      if (next.role === 'assistant' && next.isError) {
        useChatStore.setState((state) => ({
          messages: state.messages.filter(m => m.id !== next.id),
        }));
      }
    }
    // Restore per-message idempotency key so retry reuses the original key —
    // prevents server-side duplicates when the first attempt partially succeeded.
    // Keys now survive navigation (stored at module level). If the per-message
    // key expired, try the content-based key (slightly later timestamp may still
    // be alive). If both expired, pass null so the server's sha256-content-hash
    // dedup catches it.
    const storedKey = getIdempotencyKey(messageId) ?? getFailedContentKey(msg.content);
    pendingUserMsgId.current = messageId;
    pendingAssistantMsgId.current = null;
    pendingIdempotencyKey.current = storedKey ?? null;
    send(msg.content, true);
  }

  // Purge failed messages on both focus (returning to screen) and blur (leaving).
  // Focus-purge handles failures that arrived while the user was on another tab.
  // Blur-purge prevents stale errors from lingering across navigation.
  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      // On focus — clean up any failures that resolved/lingered while away
      useChatStore.getState().purgeFailedMessages();
      // Periodic purge while focused — activates stale-message TTL checks
      // so failed/error messages don't persist indefinitely on-screen.
      const purgeInterval = setInterval(() => {
        useChatStore.getState().purgeFailedMessages();
      }, 30_000);
      return () => {
        clearInterval(purgeInterval);
        // Mark unmounted FIRST so late-arriving catch blocks roll back
        // instead of adding failed/error messages to the store.
        mountedRef.current = false;
        // On blur — abort in-flight send so late failures don't pollute the store
        abortRef.current?.abort();
        abortRef.current = null;
        // Cancel all auto-dismiss timers
        for (const t of autoDismissTimers.current.values()) clearTimeout(t);
        autoDismissTimers.current.clear();
        // Aggressively remove all failed/error/sending messages on navigation
        useChatStore.getState().removeTransientMessages();
        setLoading(false);
        isSendingRef.current = false;
        pendingUserMsgId.current = null;
        pendingAssistantMsgId.current = null;
        pendingIdempotencyKey.current = null;
        // Idempotency keys are intentionally NOT cleared here — they live at
        // module level and auto-expire after 5 min (matching server TTL) so
        // retries after navigation still prevent server-side duplicates.
      };
    }, []),
  );

  // Purge stale failed/error messages when the app returns from background.
  // useFocusEffect only handles tab navigation — AppState covers home-button
  // backgrounding where failed messages would otherwise persist indefinitely.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        useChatStore.getState().purgeFailedMessages();
      }
    });
    return () => sub.remove();
  }, []);

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
          transition: { ...springs.snappy, delay: delays.fast },
        }, reducedMotion)}
      >
        <View className={`flex-row items-end ${isUser ? 'justify-end' : 'justify-start'}`} style={{ marginVertical: spacing.xxs, gap: spacing.sm }}>
          {!isUser && (
            <MotiView
              {...maybeReduce(popIn(0, delays.fast), reducedMotion)}
              className="size-7 items-center justify-center overflow-hidden rounded-full"
              style={s.messageAvatarBg}
            >
              <Image source={require('../../../assets/pip/pip-happy.png')} style={styles.messageAvatarImage} />
            </MotiView>
          )}
          <View style={[styles.messageMaxWidth, { maxWidth: chatMaxWidth }]}>
            <View
              style={[
                styles.messageBubbleBase,
                isUser
                  ? isFailed
                    ? styles.messageBubbleUserFailed
                    : [styles.messageBubbleUser, { backgroundColor: purple[500] }]
                  : s.messageBubbleAssistant,
              ]}
            >
              <Text style={isUser ? s.messageTextUser : s.messageTextAssistant}>
                {item.content}
              </Text>
            </View>
            {isUser && status && (
              <View style={styles.statusRow} accessibilityLiveRegion="assertive">
                {status === 'sending' && (
                  <Text style={s.statusSending} accessibilityLabel="Sending message">Sending…</Text>
                )}
                {status === 'sent' && (
                  <View style={styles.statusSentRow} accessibilityLabel="Message sent">
                    <Ionicons name="checkmark-done-outline" size={13} color={teal[200]} />
                    <Text style={styles.statusSentText}>Sent</Text>
                  </View>
                )}
                {isFailed && (
                  <View style={styles.statusFailedRow} accessibilityLabel="Message failed to send">
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
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss failed message"
                      onPress={() => {
                        const t2 = autoDismissTimers.current.get(item.id);
                        if (t2) { clearTimeout(t2); autoDismissTimers.current.delete(item.id); }
                        dismissFailedMessage(item.id);
                        clearPendingForMessage(item.id);
                      }}
                      hitSlop={12}
                      style={styles.retryButton}
                    >
                      <Ionicons name="close-outline" size={13} color={t.muted} />
                      <Text style={[styles.retryText, { color: t.muted }]}>Dismiss</Text>
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
          contentContainerStyle={[{ paddingHorizontal: layout.screenPaddingH, paddingVertical: layout.screenPaddingTop, gap: spacing.xs }, messages.length === 0 ? styles.emptyContentContainer : undefined]}
          ListEmptyComponent={(
            <View className="items-center" style={{ paddingHorizontal: layout.screenPaddingH }}>
              {/* Pip avatar — floats gently to feel alive */}
              <MotiView
                {...maybeReduce(popIn(0, delays.slow), reducedMotion)}
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
                {...maybeReduce(entrance(0, delays.slow * 2), reducedMotion)}
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
                {...maybeReduce(entrance(0, delays.slow * 2 + delays.normal), reducedMotion)}
                className="w-full"
                style={[styles.promptSuggestionsGap, { marginTop: spacing.lg }]}
              >
                <Text style={s.tryAskingLabel}>
                  TRY ASKING
                </Text>
                <View className="flex-row flex-wrap justify-center" style={{ gap: spacing.sm }}>
                  {examplePrompts.map((prompt, i) => (
                    <MotiView
                      key={prompt.text}
                      {...maybeReduce(popIn(i, delays.slow * 3), reducedMotion)}
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
          {...maybeReduce(entrance(0, delays.slow), reducedMotion)}
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
              className="flex-1 text-[15px]"
              style={[s.textInputColor, { paddingVertical: spacing.xsPlus }]}
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
  // --- Extracted from theme-dependent useMemo (static layout) ---
  safeArea: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingH,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  headerAvatarBorder: {
    borderWidth: 1.5,
  },
  headerName: {
    fontSize: 18,
    fontFamily: 'Sora_700Bold',
  },
  headerOnline: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  messageBubbleAssistant: {
    borderBottomLeftRadius: radii.xs,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  statusSending: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: 'Sora_700Bold',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 22,
  },
  tryAskingLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  promptChipBase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
  },
  promptChipText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyAvatarBorder: {
    borderWidth: 2,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    margin: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
  },
  textInputBase: {
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBubbleUser: {
    borderBottomRightRadius: radii.xs,
  },
  messageMaxWidth: {},
  typingDotsContainer: {},
  messageBubbleUserFailed: {
    backgroundColor: '#7C3AED80',
    borderBottomRightRadius: radii.xs,
  },
  // --- Original static styles ---
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: radii.xs,
    backgroundColor: teal[200],
  },
  typingLabel: {
    color: teal[200],
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: spacing.xs,
  },
  messageAvatarImage: {
    width: 32,
    height: 32,
    resizeMode: 'cover',
  },
  messageBubbleBase: {
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  statusSentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  statusSentText: {
    fontSize: 11,
    color: teal[200],
    fontFamily: 'Inter_500Medium',
  },
  statusFailedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusFailedText: {
    fontSize: 11,
    color: semantic.error,
    fontFamily: 'Inter_500Medium',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginLeft: spacing.xs,
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
    gap: spacing.sm,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: radii.xs,
    backgroundColor: semantic.success,
  },
  demoBadge: {
    backgroundColor: '#F5A62318',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.smPlus,
    paddingVertical: spacing.xs,
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
    borderRadius: radii.pill,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  emptyAvatarImage: {
    width: 110,
    height: 110,
    resizeMode: 'cover',
  },
  promptSuggestionsGap: {
    gap: spacing.sm,
  },
  promptIconContainer: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.92 }],
  },
});
