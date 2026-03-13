import { createMutation } from 'react-query-kit';
import { client } from '@/lib/api/client';

type ChatResponse = { reply: string };
type ChatVariables = { message: string };

export const useSendMessage = createMutation<ChatResponse, ChatVariables>({
  mutationFn: async (variables) => {
    const { data } = await client.post<ChatResponse>('/api/chat', variables);
    return data;
  },
});
