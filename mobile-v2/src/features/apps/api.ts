import { createQuery } from 'react-query-kit';
import { client } from '@/lib/api/client';

type AppsResponse = { connected: string[]; missing: string[] };

export const useApps = createQuery<AppsResponse>({
  queryKey: ['apps'],
  fetcher: async () => {
    // Shared abort controller caps total time across both endpoints to 8s,
    // preventing the old 20s worst-case (10s × 2 sequential requests).
    const controller = new AbortController();
    const overallTimeout = setTimeout(() => controller.abort(), 8000);
    try {
      try {
        const { data } = await client.get<AppsResponse>('/api/apps', {
          signal: controller.signal,
          timeout: 5000,
        });
        return data;
      } catch (err: any) {
        // If the overall timeout already fired, don't bother with fallback.
        if (controller.signal.aborted) throw err;
        // Let 401s propagate so the Axios interceptor triggers auto-logout.
        if (err?.response?.status === 401) throw err;
        // Fallback endpoint — also guard against 401 so auth failures
        // always surface instead of returning undefined data.
        let fallbackData: AppsResponse;
        try {
          const res = await client.get<AppsResponse>('/connect/status', {
            signal: controller.signal,
            timeout: 5000,
          });
          fallbackData = res.data;
        } catch (fallbackErr: any) {
          if (fallbackErr?.response?.status === 401) throw fallbackErr;
          throw fallbackErr;
        }
        return fallbackData;
      }
    } finally {
      clearTimeout(overallTimeout);
    }
  },
});
