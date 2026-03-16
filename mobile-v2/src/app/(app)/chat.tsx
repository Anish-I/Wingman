import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView, AnimatePresence } from 'moti';
import Env from 'env';
import { useChatStore } from '@/features/chat/store';
import { useSendMessage } from '@/features/chat/api';
import type { Message } from '@/types';

const IS_STUB = !Env.EXPO_PUBLIC_API_URL || Env.EXPO_PUBLIC_API_URL === 'http://localhost:3001';

const PIP_GREETINGS = [
  'Ask me anything! I love helping.',
  'Ready when you are! What\'s up?',
  'Coo! Let\'s get things done.',
  'Your personal pigeon, at your service!',
];

function TypingDots() {
  return (
    <View className="flex-row gap-1.5 items-center px-4 pb-3">
      <MotiView
        from={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 12 }}
        className="flex-row items-center gap-2 bg-[#1A1A1A] rounded-2xl rounded-bl-[4px] px-4 py-3"
      >
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ translateY: 0, scale: 1 }}
            animate={{ translateY: -5, scale: 1.2 }}
            transition={{
              type: 'timing',
              duration: 350,
              loop: true,
              repeatReverse: true,
              delay: i * 120,
            }}
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6EC6B8' }}
          />
        ))}
      </MotiView>
      <Text className="text-[#6EC6B8] text-[13px] font-semibold ml-1">Pip is thinking...</Text>
    </View>
  );
}

export default function ChatScreen() {
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
    if (!msg || loading) return;
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
    } catch (err: unknown) {
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Something went wrong.',
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const examplePrompts = [
    { text: 'Schedule a meeting', icon: 'calendar-outline' as const, color: '#F5A623' },
    { text: 'Send an email', icon: 'mail-outline' as const, color: '#4A7BD9' },
    { text: 'Play music', icon: 'musical-notes-outline' as const, color: '#9B7EC8' },
    { text: 'Check my tasks', icon: 'checkmark-circle-outline' as const, color: '#6EC6B8' },
    { text: 'What can you do?', icon: 'sparkles-outline' as const, color: '#F5A623' },
  ];

  const canSend = input.trim().length > 0 && !loading;

  function renderItem({ item, index }: { item: Message; index: number }) {
    const isUser = item.role === 'user';
    return (
      <MotiView
        from={{ opacity: 0, translateY: 12, scale: 0.95 }}
        animate={{ opacity: 1, translateY: 0, scale: 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 150, delay: 50 }}
      >
        <View className={`flex-row items-end gap-2 my-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
          {!isUser && (
            <MotiView
              from={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10, delay: 100 }}
              className="w-7 h-7 rounded-full bg-[#1A1A1A] overflow-hidden items-center justify-center"
            >
              <Image source={require('../../../assets/pip/pip-happy.png')} style={{ width: 32, height: 32, resizeMode: 'cover' }} />
            </MotiView>
          )}
          <View
            className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
              isUser ? 'bg-[#3B5998] rounded-br-[4px]' : 'bg-[#1A1A1A] rounded-bl-[4px] border border-[#2A2A2A]'
            }`}
          >
            <Text className={`text-[15px] leading-[22px] ${isUser ? 'text-white' : 'text-[#E0E0E0]'}`}>
              {item.content}
            </Text>
          </View>
        </View>
      </MotiView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-[#0C0C0C] border-b border-[#1A1A1A] gap-3">
        <MotiView
          from={{ rotate: '0deg' }}
          animate={{ rotate: '0deg' }}
          className="w-11 h-11 rounded-full bg-[#1A1A1A] overflow-hidden items-center justify-center border-2 border-[#6EC6B8]/20"
        >
          <Image source={require('../../../assets/pip/pip-happy.png')} style={{ width: 48, height: 48, resizeMode: 'cover' }} />
        </MotiView>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-foreground text-lg font-bold">Pip</Text>
            <View className="w-2 h-2 rounded-full bg-[#32D74B]" />
          </View>
          <Text className="text-[#6EC6B8] text-xs font-medium">Online • Your AI pigeon</Text>
        </View>
        {IS_STUB && (
          <View className="bg-[#F5A62318] rounded-full px-2.5 py-1">
            <Text className="text-[#F5A623] text-[10px] font-bold">DEMO</Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerClassName="p-4 gap-1"
          contentContainerStyle={messages.length === 0 ? { flexGrow: 1, justifyContent: 'center' } : undefined}
          ListEmptyComponent={
            <View className="items-center px-6">
              {/* Pip avatar with glow */}
              <MotiView
                from={{ scale: 0, rotate: '-10deg' }}
                animate={{ scale: 1, rotate: '0deg' }}
                transition={{ type: 'spring', damping: 8, stiffness: 80, delay: 200 }}
              >
                <View className="w-[100px] h-[100px] rounded-full bg-[#1A1A1A] border-[3px] border-[#6EC6B8]/25 justify-center items-center overflow-hidden mb-3">
                  <Image source={require('../../../assets/pip/pip-wave.png')} style={{ width: 110, height: 110, resizeMode: 'cover' }} />
                </View>
              </MotiView>

              <MotiView
                from={{ opacity: 0, translateY: 10 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ delay: 400 }}
              >
                <Text className="text-foreground text-[24px] font-extrabold mb-1 text-center">Hey! I'm Pip 🕊️</Text>
                <Text className="text-[#8A8A8A] text-[15px] text-center mb-2 leading-[22px]">
                  {greeting}
                </Text>
              </MotiView>

              {/* Prompt suggestions */}
              <MotiView
                from={{ opacity: 0, translateY: 20 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ delay: 600 }}
                className="w-full mt-4"
                style={{ gap: 8 }}
              >
                <Text className="text-[#525252] text-xs font-bold uppercase tracking-widest text-center mb-1">Try asking</Text>
                <View className="flex-row flex-wrap justify-center gap-2">
                  {examplePrompts.map((prompt, i) => (
                    <MotiView
                      key={prompt.text}
                      from={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', damping: 12, delay: 700 + i * 80 }}
                    >
                      <TouchableOpacity
                        className="flex-row items-center gap-2 bg-[#1A1A1A] rounded-2xl px-4 py-3 border border-[#2A2A2A]"
                        onPress={() => send(prompt.text)}
                        activeOpacity={0.7}
                      >
                        <View
                          className="w-7 h-7 rounded-lg items-center justify-center"
                          style={{ backgroundColor: prompt.color + '20' }}
                        >
                          <Ionicons name={prompt.icon} size={15} color={prompt.color} />
                        </View>
                        <Text className="text-foreground text-[13px] font-semibold">{prompt.text}</Text>
                      </TouchableOpacity>
                    </MotiView>
                  ))}
                </View>
              </MotiView>
            </View>
          }
        />

        {loading && <TypingDots />}

        {/* Input bar */}
        <MotiView
          from={{ translateY: 20, opacity: 0 }}
          animate={{ translateY: 0, opacity: 1 }}
          transition={{ delay: 300 }}
          className="flex-row items-end bg-[#1A1A1A] m-3 mb-4 rounded-2xl px-3.5 py-2 gap-2 border border-[#2A2A2A]"
        >
          <TextInput
            className="flex-1 text-foreground text-[15px] py-1.5"
            style={{ maxHeight: 120 }}
            value={input}
            onChangeText={setInput}
            placeholder="Text Pip..."
            placeholderTextColor="#525252"
            multiline
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <MotiView
            animate={{ scale: canSend ? 1 : 0.85, opacity: canSend ? 1 : 0.4 }}
            transition={{ type: 'spring', damping: 12 }}
          >
            <TouchableOpacity
              className="w-[36px] h-[36px] rounded-xl items-center justify-center"
              style={{ backgroundColor: canSend ? '#3B5998' : '#242424' }}
              onPress={() => send()}
              disabled={!canSend}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-up" size={20} color={canSend ? '#FFFFFF' : '#525252'} />
            </TouchableOpacity>
          </MotiView>
        </MotiView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
