import { createQuery } from 'react-query-kit';
import { client } from '@/lib/api/client';

type AppsResponse = { connected: string[]; missing: string[] };

export const useApps = createQuery<AppsResponse>({
  queryKey: ['apps'],
  fetcher: async () => {
    const { data } = await client.get<AppsResponse>('/api/apps');
    return data;
  },
});
