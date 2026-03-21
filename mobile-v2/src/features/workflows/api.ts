import { createQuery, createMutation } from 'react-query-kit';
import { Alert, Platform } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { client } from '@/lib/api/client';
import type { Workflow } from '@/types';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    showMessage({ message: title, description: message, type: 'info', duration: 3000 });
  } else {
    Alert.alert(title, message);
  }
}

type WorkflowsResponse = { workflows: Workflow[] };
type WorkflowResponse = { workflow: Workflow };

export const useWorkflows = createQuery<WorkflowsResponse>({
  queryKey: ['workflows'],
  fetcher: async () => {
    // Let errors propagate so the UI can detect fetch failures
    // instead of silently returning empty data.
    const { data } = await client.get<WorkflowsResponse>('/api/workflows');
    return data;
  },
});

export const useCreateWorkflow = createMutation<WorkflowResponse, { name: string; description: string; trigger_type: string; actions: unknown[] }>({
  mutationFn: async (variables) => {
    try {
      const { data } = await client.post<WorkflowResponse>('/api/workflows', variables);
      return data;
    } catch {
      showAlert('Demo Mode', 'Workflow creation is not available without a backend.');
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
      showAlert('Demo Mode', 'Workflow updates are not available without a backend.');
      throw new Error('Demo mode: backend unavailable');
    }
  },
});
