import { createMutation } from 'react-query-kit';
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
    } catch {
      // Demo mode: return mock response when backend is unavailable
      await new Promise((r) => setTimeout(r, 800));
      return { reply: MOCK_REPLY };
    }
  },
});
