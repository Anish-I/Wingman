import { createQuery } from 'react-query-kit';
import { client } from '@/lib/api/client';

type UserProfile = {
  id: number;
  phone: string | null;
  name: string | null;
  preferences: Record<string, unknown>;
  stats: {
    apps: number;
    workflows: number;
    messages: number;
  };
};

export const useProfile = createQuery<UserProfile>({
  queryKey: ['profile'],
  fetcher: async () => {
    const { data } = await client.get<UserProfile>('/auth/me');
    return data;
  },
});
