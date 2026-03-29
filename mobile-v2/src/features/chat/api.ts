import { createMutation } from 'react-query-kit';
import { AxiosError } from 'axios';
import { client } from '@/lib/api/client';
import { getToken } from '@/lib/auth/utils';

let _idemCounter = 0;
/** Generate a unique idempotency key (timestamp + counter + random). */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${++_idemCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Client-side timeout for chat requests (ms).  LLM responses can be slow,
 *  but anything beyond this is almost certainly a hang. */
export const CHAT_TIMEOUT_MS = 45_000;

type ChatResponse = { reply: string };
type ChatVariables = { message: string; idempotencyKey?: string | null; signal?: AbortSignal };

const DEMO_TOKEN = 'demo-mock-token';

export const useSendMessage = createMutation<ChatResponse, ChatVariables>({
  mutationFn: async (variables) => {
    // Do NOT mask auth failures with demo replies.
    // If user has a real token, always hit the real API.
    // If auth fails, the error should surface immediately so the user can log back in.
    const token = getToken();
    
    // Reject demo token usage — it should not be used in real authenticated routes
    if (token === DEMO_TOKEN) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    try {
      // When idempotencyKey is explicitly null (retry without stored key), omit
      // the header so the server falls back to sha256(message) content-hash dedup.
      // When undefined (new message without caller-provided key), generate one.
      const key = variables.idempotencyKey === null
        ? null
        : (variables.idempotencyKey ?? generateIdempotencyKey());
      const headers: Record<string, string> = {};
      if (key) headers['X-Idempotency-Key'] = key;
      const { data } = await client.post<ChatResponse>(
        '/api/chat',
        { message: variables.message },
        { headers, signal: variables.signal, timeout: CHAT_TIMEOUT_MS },
      );
      return data;
    } catch (err) {
      if (err instanceof AxiosError) {
        // Propagate cancellation directly — caller checks signal.aborted
        if (variables.signal?.aborted) throw err;
        if (err.code === 'ECONNABORTED') {
          throw new Error('The request timed out. Please try again.');
        }
        if (err.response?.status === 401) {
          throw new Error('Your session has expired. Please sign in again.');
        }
        if (!err.response) {
          throw new Error('Unable to reach the server. Check your connection.');
        }
        if (err.response?.status === 500) {
          throw new Error('The server encountered an error. The AI service may not be configured yet.');
        }
      }
      throw err;
    }
  },
});
