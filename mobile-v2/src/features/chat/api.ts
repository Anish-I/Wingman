import { createMutation } from 'react-query-kit';
import { AxiosError } from 'axios';
import { client } from '@/lib/api/client';
import { getToken } from '@/lib/auth/utils';

let _idemCounter = 0;
/** Generate a unique idempotency key (timestamp + counter + random). */
function generateIdempotencyKey(): string {
  return `${Date.now()}-${++_idemCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

type ChatResponse = { reply: string };
type ChatVariables = { message: string; idempotencyKey?: string };

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
      const key = variables.idempotencyKey ?? generateIdempotencyKey();
      const { data } = await client.post<ChatResponse>(
        '/api/chat',
        { message: variables.message },
        { headers: { 'X-Idempotency-Key': key } },
      );
      return data;
    } catch (err) {
      if (err instanceof AxiosError) {
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
