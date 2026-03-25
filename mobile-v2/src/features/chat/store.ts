import { create } from 'zustand';
import type { Message } from '@/types';
import { createSelectors } from '@/lib/utils';

type ChatState = {
  messages: Message[];
  loading: boolean;
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  purgeFailedMessages: () => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
};

const _useChatStore = create<ChatState>((set) => ({
  messages: [],
  loading: false,
  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
    })),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),
  purgeFailedMessages: () =>
    set((state) => {
      const failedIds = new Set(
        state.messages.filter((m) => m.status === 'failed').map((m) => m.id),
      );
      if (failedIds.size === 0) return state;
      // Collect IDs of error assistant messages that immediately follow a failed user message
      const errorIds = new Set<string>();
      for (let i = 0; i < state.messages.length; i++) {
        const m = state.messages[i];
        if (failedIds.has(m.id) && i + 1 < state.messages.length) {
          const next = state.messages[i + 1];
          if (next.role === 'assistant') errorIds.add(next.id);
        }
      }
      return {
        messages: state.messages.filter(
          (m) => !failedIds.has(m.id) && !errorIds.has(m.id),
        ),
      };
    }),
  setLoading: (loading) => set({ loading }),
  clearMessages: () => set({ messages: [] }),
}));

export const useChatStore = createSelectors(_useChatStore);
