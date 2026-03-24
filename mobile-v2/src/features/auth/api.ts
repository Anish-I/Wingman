import { createMutation } from 'react-query-kit';
import { client } from '@/lib/api/client';

export const useRequestOtp = createMutation<{ ok: boolean; otp_request_id: string }, { phone: string }>({
  mutationFn: async (variables) => {
    const { data } = await client.post('/auth/request-otp', variables);
    return data;
  },
});

export const useVerifyOtp = createMutation<{ token: string }, { phone: string; code: string; otp_request_id: string }>({
  mutationFn: async (variables) => {
    const { data } = await client.post('/auth/verify-otp', variables);
    return data;
  },
});

export const useGoogleAuth = createMutation<{ token: string }, { code: string }>({
  mutationFn: async (variables) => {
    const { data } = await client.post('/auth/google', variables);
    return data;
  },
});
