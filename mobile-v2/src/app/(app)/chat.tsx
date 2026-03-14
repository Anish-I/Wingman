import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import Env from 'env';
import { useChatStore } from '@/features/chat/store';
import { useSendMessage } from '@/features/chat/api';
import type { Message } from '@/types';

const IS_STUB = !Env.EXPO_PUBLIC_API_URL || Env.EXPO_PUBLIC_API_URL === 'http://localhost:3001';

function TypingDots() {
  return (
    <View className="flex-row gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <MotiView
          key={i}
          from={{ translateY: 0 }}
          animate={{ translateY: -6 }}
          transition={{
            type: 'timing',
            duration: 300,
            loop: true,
            repeatReverse: true,
            delay: i * 150,
          }}
          className="w-[7px] h-[7px] rounded-full bg-[#6EC6B8]"
        />
      ))}
    </View>
  );
}

export default function ChatScreen() {
  const messages = useChatStore.use.messages();
  const loading = useChatStore.use.loading();
  const addMessage = useChatStore.use.addMessage();
  const setLoading = useChatStore.use.setLoading();
  const [input, setInput] = useState('');
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
    { text: 'Schedule a meeting', icon: 'calendar-outline' as const },
    { text: 'Send an email', icon: 'mail-outline' as const },
    { text: 'Play music', icon: 'musical-notes-outline' as const },
  ];

  const canSend = input.trim().length > 0 && !loading;

  function renderItem({ item }: { item: Message }) {
    const isUser = item.role === 'user';
    return (
      <View className={`flex-row items-end gap-2 my-0.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <View className="w-7 h-7 rounded-full bg-[#1A1A1A] overflow-hidden items-center justify-center">
            <Image source={require('../../../assets/pip/pip-happy.png')} style={{ width: 32, height: 32, resizeMode: 'cover' }} />
          </View>
        )}
        <View
          className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
            isUser ? 'bg-[#3B5998] rounded-br-[4px]' : 'bg-[#1E1E1E] rounded-bl-[4px]'
          }`}
        >
          <Text className={`text-[15px] leading-[22px] ${isUser ? 'text-white' : 'text-[#E0E0E0]'}`}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-background border-b border-border gap-2.5">
        <View className="w-10 h-10 rounded-full bg-[#1A1A1A] overflow-hidden items-center justify-center">
          <Image source={require('../../../assets/pip/pip-happy.png')} style={{ width: 46, height: 46, resizeMode: 'cover' }} />
        </View>
        <View>
          <Text className="text-foreground text-lg font-bold">Wingman</Text>
          <Text className="text-muted-foreground text-xs mt-px">Your AI assistant</Text>
        </View>
        {IS_STUB && (
          <View className="ml-auto bg-[rgba(251,191,36,0.12)] rounded-full px-2.5 py-1">
            <Text className="text-[#FBBF24] text-[11px] font-semibold">Simulated SMS</Text>
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
              <View className="w-[88px] h-[88px] rounded-full bg-[#1A1A1A] border-2 border-[rgba(110,198,184,0.12)] justify-center items-center overflow-hidden mb-4">
                <Image source={require('../../../assets/pip/pip-wave.png')} style={{ width: 100, height: 100, resizeMode: 'cover' }} />
              </View>
              <Text className="text-foreground text-[22px] font-bold mb-1">Hey! I'm Pip</Text>
              <Text className="text-muted-foreground text-[15px] text-center mb-6 leading-[22px]">
                Your AI assistant. Try asking me something:
              </Text>
              <View className="flex-row flex-wrap justify-center gap-2">
                {examplePrompts.map((prompt) => (
                  <TouchableOpacity
                    key={prompt.text}
                    className="flex-row items-center gap-1.5 bg-card rounded-[20px] px-4 py-2.5 border border-border"
                    onPress={() => send(prompt.text)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={prompt.icon} size={16} color="#6EC6B8" />
                    <Text className="text-foreground text-sm font-medium">{prompt.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
        />
        {loading && (
          <View className="flex-row items-center gap-2 px-4 pb-2">
            <TypingDots />
            <Text className="text-muted-foreground text-[13px]">Pip is thinking...</Text>
          </View>
        )}
        <View className="flex-row items-end bg-card m-2 mb-4 rounded-full px-3.5 py-2 gap-2 border border-border">
          <TextInput
            className="flex-1 text-foreground text-[15px] py-1"
            style={{ maxHeight: 120 }}
            value={input}
            onChangeText={setInput}
            placeholder="Text Pip..."
            placeholderTextColor="#5D6279"
            multiline
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <TouchableOpacity
            className={`w-[34px] h-[34px] rounded-full items-center justify-center ${
              canSend ? 'bg-[#3B5998]' : 'bg-border'
            }`}
            onPress={() => send()}
            disabled={!canSend}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-up" size={20} color={canSend ? '#FFFFFF' : '#5D6279'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
