import { create } from 'zustand';
import type { Message } from '@/types';
import { createSelectors } from '@/lib/utils';

type ChatState = {
  messages: Message[];
  loading: boolean;
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  dismissFailedMessage: (id: string) => void;
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
  dismissFailedMessage: (id) =>
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === id);
      if (idx === -1 || state.messages[idx].status !== 'failed') return state;
      const toRemove = new Set<string>([id]);
      // Also remove the error assistant message that immediately follows (only if tagged)
      const next = idx + 1 < state.messages.length ? state.messages[idx + 1] : null;
      if (next && next.role === 'assistant' && next.isError) {
        toRemove.add(next.id);
      }
      return { messages: state.messages.filter((m) => !toRemove.has(m.id)) };
    }),
  purgeFailedMessages: () =>
    set((state) => {
      const failedIds = new Set(
        state.messages.filter((m) => m.status === 'failed').map((m) => m.id),
      );
      // Collect IDs of error assistant messages — tagged with isError flag,
      // plus positional fallback for any that were added before the flag existed.
      const errorIds = new Set<string>(
        state.messages.filter((m) => m.isError).map((m) => m.id),
      );
      for (let i = 0; i < state.messages.length; i++) {
        const m = state.messages[i];
        if (failedIds.has(m.id) && i + 1 < state.messages.length) {
          const next = state.messages[i + 1];
          if (next.role === 'assistant') errorIds.add(next.id);
        }
      }
      // Also purge stale error messages older than 5 minutes — catches any
      // that slipped past earlier cleanup (e.g. race with late-arriving failures).
      const staleThreshold = Date.now() - 5 * 60 * 1000;
      for (const m of state.messages) {
        if (m.isError && m.timestamp < staleThreshold) {
          errorIds.add(m.id);
        }
      }
      // Purge orphaned "sending" messages older than 2 minutes — handles app
      // crashes or force-kills where the send never resolved.
      const sendingThreshold = Date.now() - 2 * 60 * 1000;
      for (const m of state.messages) {
        if (m.status === 'sending' && m.timestamp < sendingThreshold) {
          failedIds.add(m.id);
        }
      }
      if (failedIds.size === 0 && errorIds.size === 0) return state;
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
