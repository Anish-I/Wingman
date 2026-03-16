import { createMutation } from 'react-query-kit';
import { AxiosError } from 'axios';
import { client } from '@/lib/api/client';

type ChatResponse = { reply: string };
type ChatVariables = { message: string };

const MOCK_REPLY =
  'Hey! I\u2019m Pip, your AI pigeon. The server is not connected right now, but I\u2019m here in demo mode!';

export const useSendMessage = createMutation<ChatResponse, ChatVariables>({
  mutationFn: async (variables) => {
    try {
      const { data } = await client.post<ChatResponse>('/api/chat', variables);
      return data;
    } catch (err) {
      // Only fall back to demo mode for network errors (no response from server)
      if (err instanceof AxiosError && !err.response) {
        await new Promise((r) => setTimeout(r, 800));
        return { reply: MOCK_REPLY };
      }
      // For actual server errors (401, 500, etc.), re-throw so the user sees the error
      throw err;
    }
  },
});
