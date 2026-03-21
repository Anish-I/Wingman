import type { Message } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import Env from 'env';
import { MotiView } from 'moti';
import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { blue, purple, semantic, surface, text as t, teal } from '@/components/ui/tokens';
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
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: teal[300] }}
          />
        ))}
      </MotiView>
      <Text style={{ color: teal[300], fontSize: 13, fontFamily: 'Inter_600SemiBold', marginLeft: 4 }}>
        Pip is thinking...
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const reducedMotion = useReducedMotion();
  const messages = useChatStore.use.messages();
  const loading = useChatStore.use.loading();
  const addMessage = useChatStore.use.addMessage();
  const setLoading = useChatStore.use.setLoading();
  const [input, setInput] = useState('');
  const [greeting] = useState(() => PIP_GREETINGS[Math.floor(Math.random() * PIP_GREETINGS.length)]);
  const listRef = useRef<FlatList>(null);
  const sendMutation = useSendMessage();

  async function send(text?: string) {
    const msg = text ?? input.trim();
    if (!msg || loading)
      return;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInput('');
    setLoading(true);
    try {
      const result = await sendMutation.mutateAsync({ message: msg });
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.reply,
        timestamp: Date.now(),
      });
    }
    catch (err: unknown) {
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong.',
        timestamp: Date.now(),
      });
    }
    finally {
      setLoading(false);
    }
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
              {...popIn(0, 50)}
              className="size-7 items-center justify-center overflow-hidden rounded-full"
              style={{ backgroundColor: surface.card }}
            >
              <Image source={require('../../../assets/pip/pip-happy.png')} style={{ width: 32, height: 32, resizeMode: 'cover' }} />
            </MotiView>
          )}
          <View
            style={[
              {
                maxWidth: '78%',
                borderRadius: 18,
                paddingHorizontal: 16,
                paddingVertical: 10,
              },
              isUser
                ? { backgroundColor: purple[500], borderBottomRightRadius: 4 }
                : { backgroundColor: surface.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: surface.border },
            ]}
          >
            <Text style={{ fontSize: 15, lineHeight: 22, color: isUser ? '#FFFFFF' : t.primary }}>
              {item.content}
            </Text>
          </View>
        </View>
      </MotiView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: surface.bg }}>
      {/* Header */}
      <MotiView
        from={{ opacity: 0, translateY: -8 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={springs.gentle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: surface.bg,
          borderBottomWidth: 1,
          borderBottomColor: surface.border,
          gap: 12,
        }}
      >
        <MotiView
          from={{ rotate: '0deg' }}
          animate={{ rotate: '0deg' }}
          className="size-11 items-center justify-center overflow-hidden rounded-full"
          style={{
            backgroundColor: surface.card,
            borderWidth: 1.5,
            borderColor: purple.muted,
          }}
        >
          <Image source={require('../../../assets/pip/pip-happy.png')} style={{ width: 48, height: 48, resizeMode: 'cover' }} />
        </MotiView>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: t.primary, fontSize: 18, fontFamily: 'Sora_700Bold' }}>Pip</Text>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: semantic.success }} />
          </View>
          <Text style={{ color: teal[300], fontSize: 12, fontFamily: 'Inter_500Medium' }}>
            Online
          </Text>
        </View>
        {IS_STUB && (
          <View style={{ backgroundColor: '#F5A62318', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#F5A623', fontSize: 10, fontFamily: 'Inter_700Bold' }}>DEMO</Text>
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
          contentContainerStyle={messages.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : undefined}
          ListEmptyComponent={(
            <View className="items-center px-6">
              {/* Pip avatar — floats gently to feel alive */}
              <MotiView
                {...maybeReduce(popIn(0, 200), reducedMotion)}
              >
                <MotiView {...maybeReduce(gentleFloat(800), reducedMotion)}>
                  <View
                    style={{
                      width: 100,
                      height: 100,
                      borderRadius: 50,
                      backgroundColor: surface.card,
                      borderWidth: 2,
                      borderColor: purple.muted,
                      justifyContent: 'center',
                      alignItems: 'center',
                      overflow: 'hidden',
                      marginBottom: 12,
                    }}
                  >
                    <Image source={require('../../../assets/pip/pip-wave.png')} style={{ width: 110, height: 110, resizeMode: 'cover' }} />
                  </View>
                </MotiView>
              </MotiView>

              <MotiView
                {...maybeReduce(entrance(0, 400), reducedMotion)}
              >
                <Text style={{ color: t.primary, fontSize: 24, fontFamily: 'Sora_700Bold', textAlign: 'center', marginBottom: 4 }}>
                  Hey! I'm Pip
                </Text>
                <Text style={{ color: t.secondary, fontSize: 15, textAlign: 'center', marginBottom: 8, lineHeight: 22 }}>
                  {greeting}
                </Text>
              </MotiView>

              {/* Prompt suggestions */}
              <MotiView
                {...maybeReduce(entrance(0, 550), reducedMotion)}
                className="mt-4 w-full"
                style={{ gap: 8 }}
              >
                <Text style={{ color: t.muted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, textAlign: 'center', marginBottom: 4 }}>
                  TRY ASKING
                </Text>
                <View className="flex-row flex-wrap justify-center gap-2">
                  {examplePrompts.map((prompt, i) => (
                    <MotiView
                      key={prompt.text}
                      {...maybeReduce(popIn(i, 650), reducedMotion)}
                    >
                      <Pressable
                        style={({ pressed, hovered, focused }: any) => [
                          {
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            backgroundColor: surface.card,
                            borderRadius: 16,
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderWidth: 1,
                            borderColor: surface.border,
                          },
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
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: `${prompt.color}18`,
                          }}
                        >
                          <Ionicons name={prompt.icon} size={15} color={prompt.color} />
                        </View>
                        <Text style={{ color: t.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
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
          {...entrance(0, 200)}
        >
          <MotiView
            animate={{
              borderColor: inputFocused ? purple[500] : surface.border,
              backgroundColor: inputFocused ? `${purple[500]}08` : surface.card,
            }}
            transition={{ type: 'timing', duration: 160 }}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              backgroundColor: surface.card,
              margin: 12,
              marginBottom: 16,
              borderRadius: 18,
              paddingHorizontal: 14,
              paddingVertical: 8,
              gap: 8,
              borderWidth: 1.5,
              borderColor: surface.border,
            }}
          >
            <TextInput
              className="flex-1 py-1.5 text-[15px]"
              style={{ maxHeight: 120, color: t.primary }}
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
              {...sendButtonAnimate(canSend)}
            >
              <Pressable
                style={({ pressed, hovered, focused }: any) => [
                  {
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: canSend ? purple[500] : surface.elevated,
                  },
                  canSend && pressed ? { opacity: 0.75, transform: [{ scale: 0.85 }] } : undefined,
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
                <Ionicons name="arrow-up" size={20} color={canSend ? '#FFFFFF' : t.muted} />
              </Pressable>
            </MotiView>
          </MotiView>
        </MotiView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
