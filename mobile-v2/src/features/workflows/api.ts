import { createQuery, createMutation } from 'react-query-kit';
import { client } from '@/lib/api/client';
import type { Workflow } from '@/types';

type WorkflowsResponse = { workflows: Workflow[] };
type WorkflowResponse = { workflow: Workflow };

export const useWorkflows = createQuery<WorkflowsResponse>({
  queryKey: ['workflows'],
  fetcher: async () => {
    const { data } = await client.get<WorkflowsResponse>('/api/workflows');
    return data;
  },
});

export const useCreateWorkflow = createMutation<WorkflowResponse, { name: string; description: string; trigger_type: string; actions: unknown[] }>({
  mutationFn: async (variables) => {
    const { data } = await client.post<WorkflowResponse>('/api/workflows', variables);
    return data;
  },
});

export const useUpdateWorkflow = createMutation<WorkflowResponse, { id: string; patch: Record<string, unknown> }>({
  mutationFn: async ({ id, patch }) => {
    const { data } = await client.patch<WorkflowResponse>(`/api/workflows/${id}`, patch);
    return data;
  },
});
