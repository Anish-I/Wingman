import { createQuery } from 'react-query-kit';
import { client } from '@/lib/api/client';

type AppsResponse = { connected: string[]; missing: string[] };

export const useApps = createQuery<AppsResponse>({
  queryKey: ['apps'],
  fetcher: async () => {
    try {
      // Try the authenticated endpoint first, fall back to connect/status
      const { data } = await client.get<AppsResponse>('/api/apps');
      return data;
    } catch {
      // Try the fallback endpoint — but let it throw on failure so the
      // UI can detect errors instead of silently returning empty data.
      const { data } = await client.get<AppsResponse>('/connect/status');
      return data;
    }
  },
});
