import { createQuery, createMutation } from 'react-query-kit';
import { Alert } from 'react-native';
import { client } from '@/lib/api/client';
import type { Workflow } from '@/types';

type WorkflowsResponse = { workflows: Workflow[] };
type WorkflowResponse = { workflow: Workflow };

export const useWorkflows = createQuery<WorkflowsResponse>({
  queryKey: ['workflows'],
  fetcher: async () => {
    try {
      const { data } = await client.get<WorkflowsResponse>('/api/workflows');
      return data;
    } catch {
      // Demo mode: return empty list
      return { workflows: [] };
    }
  },
});

export const useCreateWorkflow = createMutation<WorkflowResponse, { name: string; description: string; trigger_type: string; actions: unknown[] }>({
  mutationFn: async (variables) => {
    try {
      const { data } = await client.post<WorkflowResponse>('/api/workflows', variables);
      return data;
    } catch {
      Alert.alert('Demo Mode', 'Workflow creation is not available without a backend.');
      throw new Error('Demo mode: backend unavailable');
    }
  },
});

export const usePlanWorkflow = createMutation<WorkflowResponse, { description: string }>({
  mutationFn: async (variables) => {
    const { data } = await client.post<WorkflowResponse>('/api/workflows/plan', variables);
    return data;
  },
});

export const useUpdateWorkflow = createMutation<WorkflowResponse, { id: string; patch: Record<string, unknown> }>({
  mutationFn: async ({ id, patch }) => {
    try {
      const { data } = await client.patch<WorkflowResponse>(`/api/workflows/${id}`, patch);
      return data;
    } catch {
      Alert.alert('Demo Mode', 'Workflow updates are not available without a backend.');
      throw new Error('Demo mode: backend unavailable');
    }
  },
});
