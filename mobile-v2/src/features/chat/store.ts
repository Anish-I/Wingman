import { create } from 'zustand';
import type { Message } from '@/types';
import { createSelectors } from '@/lib/utils';

type ChatState = {
  messages: Message[];
  loading: boolean;
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
};

const _useChatStore = create<ChatState>((set) => ({
  messages: [],
  loading: false,
  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg].sort((a, b) => a.timestamp - b.timestamp),
    })),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  setLoading: (loading) => set({ loading }),
  clearMessages: () => set({ messages: [] }),
}));

export const useChatStore = createSelectors(_useChatStore);
