import { createQuery, createMutation } from 'react-query-kit';
import { useQueryClient } from '@tanstack/react-query';
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

type PreferencesPayload = Partial<{
  theme: string;
  language: string;
  notifications: boolean;
  timezone: string;
  smsOptIn: boolean;
}>;

export const useUpdatePreferences = createMutation<
  { user: UserProfile },
  PreferencesPayload
>({
  mutationFn: async (preferences) => {
    const { data } = await client.patch<{ user: UserProfile }>(
      '/api/user/preferences',
      preferences,
    );
    return data;
  },
});

/** Hook that wraps useUpdatePreferences and invalidates the profile cache on success. */
export function usePersistPreferences() {
  const queryClient = useQueryClient();
  const mutation = useUpdatePreferences();

  return {
    ...mutation,
    mutate: (
      prefs: PreferencesPayload,
      opts?: Parameters<typeof mutation.mutate>[1],
    ) =>
      mutation.mutate(prefs, {
        ...opts,
        onSuccess: (...args) => {
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          opts?.onSuccess?.(...args);
        },
      }),
  };
}
