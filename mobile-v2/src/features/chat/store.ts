import { create } from 'zustand';
import type { Message } from '@/types';
import { createSelectors } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Module-level idempotency key storage — survives component remount and
// navigation so retries after navigating away can still reuse the original
// key, preventing server-side duplicates on partial success.
// ---------------------------------------------------------------------------
const IDEM_KEY_TTL = 5 * 60_000; // 5 min — matches server-side Redis TTL

const _idempotencyKeys = new Map<string, { key: string; ts: number }>();

/** Retrieve a stored idempotency key, returning null if expired or missing. */
export function getIdempotencyKey(msgId: string): string | null {
  const entry = _idempotencyKeys.get(msgId);
  if (!entry) return null;
  if (Date.now() - entry.ts > IDEM_KEY_TTL) {
    _idempotencyKeys.delete(msgId);
    return null;
  }
  return entry.key;
}

/** Store an idempotency key for a message. */
export function setIdempotencyKey(msgId: string, key: string) {
  _idempotencyKeys.set(msgId, { key, ts: Date.now() });
}

/** Remove a single idempotency key (e.g. after confirmed success). */
export function deleteIdempotencyKey(msgId: string) {
  _idempotencyKeys.delete(msgId);
}

/** Evict expired keys — called by the background purge interval. */
function evictStaleIdempotencyKeys() {
  const now = Date.now();
  for (const [id, entry] of _idempotencyKeys) {
    if (now - entry.ts > IDEM_KEY_TTL) _idempotencyKeys.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Failed-content → idempotency-key tracker — survives navigation so that
// re-sending the same message content after navigating away from a failure
// reuses the original key, preventing server-side duplicates when the first
// attempt partially succeeded (message saved but response lost).
// ---------------------------------------------------------------------------
const _failedContentKeys = new Map<string, { key: string; ts: number }>();

/** Remember the idempotency key used for a failed send of this content. */
export function trackFailedContent(content: string, idempotencyKey: string) {
  _failedContentKeys.set(content.trim(), { key: idempotencyKey, ts: Date.now() });
}

/** Retrieve the original idempotency key for content that previously failed. */
export function getFailedContentKey(content: string): string | null {
  const entry = _failedContentKeys.get(content.trim());
  if (!entry) return null;
  if (Date.now() - entry.ts > IDEM_KEY_TTL) {
    _failedContentKeys.delete(content.trim());
    return null;
  }
  return entry.key;
}

/** Clear tracking after confirmed success or intentional dismissal. */
export function clearFailedContent(content: string) {
  _failedContentKeys.delete(content.trim());
}

function evictStaleFailedContent() {
  const now = Date.now();
  for (const [content, entry] of _failedContentKeys) {
    if (now - entry.ts > IDEM_KEY_TTL) _failedContentKeys.delete(content);
  }
}

type ChatState = {
  messages: Message[];
  loading: boolean;
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  removeMessage: (id: string) => void;
  dismissFailedMessage: (id: string) => void;
  purgeFailedMessages: () => void;
  removeTransientMessages: () => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
};

const _useChatStore = create<ChatState>((set) => ({
  messages: [],
  loading: false,
  addMessage: (msg) =>
    set((state) => {
      // Defensive dedup — prevent duplicate messages from races between
      // the send success path and retry/navigation cleanup.
      if (state.messages.some((m) => m.id === msg.id)) return state;
      return { messages: [...state.messages, msg] };
    }),
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
      const now = Date.now();
      const toRemove = new Set<string>();
      // Only remove failed messages older than 30 seconds — fresh ones survive
      // so the user has time to retry or dismiss before they vanish.
      const failedThreshold = now - 30_000;
      for (const m of state.messages) {
        if (m.status === 'failed' && m.timestamp < failedThreshold) {
          toRemove.add(m.id);
        }
      }
      // Remove paired assistant error messages that follow stale failures
      // (positional fallback for messages added before the isError flag existed).
      for (let i = 0; i < state.messages.length; i++) {
        const m = state.messages[i];
        if (toRemove.has(m.id) && i + 1 < state.messages.length) {
          const next = state.messages[i + 1];
          if (next.role === 'assistant') toRemove.add(next.id);
        }
      }
      // Purge stale error messages older than 30 seconds — catches orphans
      // from race conditions or late-arriving failures.
      const staleErrorThreshold = now - 30_000;
      for (const m of state.messages) {
        if (m.isError && m.timestamp < staleErrorThreshold) {
          toRemove.add(m.id);
        }
      }
      // Purge orphaned "sending" messages older than 2 minutes — handles app
      // crashes or force-kills where the send never resolved.
      const sendingThreshold = now - 2 * 60_000;
      for (const m of state.messages) {
        if (m.status === 'sending' && m.timestamp < sendingThreshold) {
          toRemove.add(m.id);
        }
      }
      if (toRemove.size === 0) return state;
      return { messages: state.messages.filter((m) => !toRemove.has(m.id)) };
    }),
  removeTransientMessages: () =>
    set((state) => {
      const dominated = state.messages.filter(
        (m) => m.status === 'failed' || m.status === 'sending' || m.isError,
      );
      if (dominated.length === 0) return state;
      const ids = new Set(dominated.map((m) => m.id));
      return { messages: state.messages.filter((m) => !ids.has(m.id)) };
    }),
  setLoading: (loading) => set({ loading }),
  clearMessages: () => set({ messages: [] }),
}));

// ---------------------------------------------------------------------------
// Background purge — runs every 60s regardless of which screen is focused,
// preventing error/failed messages from persisting indefinitely in the store.
// ---------------------------------------------------------------------------
setInterval(() => {
  _useChatStore.getState().purgeFailedMessages();
  evictStaleIdempotencyKeys();
  evictStaleFailedContent();
}, 60_000);

export const useChatStore = createSelectors(_useChatStore);
