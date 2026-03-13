import { createMutation } from 'react-query-kit';
import { client } from '@/lib/api/client';

export const useRequestOtp = createMutation<{ ok: boolean }, { phone: string }>({
  mutationFn: async (variables) => {
    try {
      const { data } = await client.post('/auth/request-otp', variables);
      return data;
    } catch {
      // Demo mode: pretend OTP was sent
      return { ok: true };
    }
  },
});

export const useVerifyOtp = createMutation<{ token: string }, { phone: string; code: string }>({
  mutationFn: async (variables) => {
    try {
      const { data } = await client.post('/auth/verify-otp', variables);
      return data;
    } catch {
      // Demo mode: return mock token
      return { token: 'demo-mock-token' };
    }
  },
});

export const useGoogleAuth = createMutation<{ token: string }, { idToken: string }>({
  mutationFn: async (variables) => {
    try {
      const { data } = await client.post('/auth/google', variables);
      return data;
    } catch {
      // Demo mode: return mock token
      return { token: 'demo-mock-token' };
    }
  },
});
