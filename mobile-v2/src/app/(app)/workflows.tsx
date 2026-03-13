import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Switch, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PipCard from '@/components/wingman/pip-card';
import { useWorkflows, useCreateWorkflow, useUpdateWorkflow } from '@/features/workflows/api';
import type { Workflow } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function getTriggerIcon(type: string): { icon: IconName; color: string } {
  switch (type) {
    case 'schedule': return { icon: 'time', color: '#F5A623' };
    case 'event': return { icon: 'flash', color: '#9B7EC8' };
    default: return { icon: 'hand-left', color: '#4A7BD9' };
  }
}

export default function WorkflowsScreen() {
  const { data, isLoading, refetch } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const updateMutation = useUpdateWorkflow();
  const [modalVisible, setModalVisible] = useState(false);
  const [nlInput, setNlInput] = useState('');

  const workflows = data?.workflows ?? [];

  async function toggleWorkflow(id: string, active: boolean) {
    try {
      await updateMutation.mutateAsync({ id, patch: { active } });
      refetch();
    } catch {
      Alert.alert('Error', 'Could not update workflow.');
    }
  }

  async function createWorkflow() {
    if (!nlInput.trim()) return;
    try {
      await createMutation.mutateAsync({
        name: nlInput.trim(),
        description: '',
        trigger_type: 'manual',
        actions: [],
      });
      setModalVisible(false);
      setNlInput('');
      refetch();
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create workflow.');
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <ActivityIndicator color="#3B5998" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="px-6 pt-6 pb-4">
        <Text className="text-foreground text-[28px] font-extrabold">Automations</Text>
      </View>

      <FlatList
        data={workflows}
        keyExtractor={(w) => w.id}
        contentContainerClassName="px-4 gap-2 pb-[100px]"
        ListEmptyComponent={
          <View className="items-center mt-10 px-6">
            <PipCard expression="thinking" message="No automations yet. Tell me what to automate!" size="small" />
          </View>
        }
        renderItem={({ item }) => {
          const trigger = getTriggerIcon(item.trigger_type);
          return (
            <View className="flex-row items-center bg-card rounded-[14px] p-4 gap-3">
              <View
                className="w-[42px] h-[42px] rounded-full items-center justify-center"
                style={{ backgroundColor: trigger.color + '20' }}
              >
                <Ionicons name={trigger.icon} size={20} color={trigger.color} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-semibold">{item.name}</Text>
                {item.description ? (
                  <Text className="text-muted-foreground text-[13px] mt-0.5" numberOfLines={2}>{item.description}</Text>
                ) : null}
              </View>
              <Switch
                value={item.active}
                onValueChange={(v) => toggleWorkflow(item.id, v)}
                trackColor={{ false: '#3A3B5C', true: '#34C759' }}
                thumbColor="#fff"
              />
            </View>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full shadow-lg"
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#4A7BD9', '#3B5998', '#2D4474']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* NL Input Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-muted rounded-t-[20px] p-6 pb-12">
            <Text className="text-foreground text-xl font-bold mb-6">New Automation</Text>
            <TextInput
              className="bg-card rounded-[10px] p-3.5 text-foreground text-[15px] mb-3 border border-border h-[100px]"
              style={{ textAlignVertical: 'top' }}
              placeholder="Describe what you want automated..."
              placeholderTextColor="#5D6279"
              value={nlInput}
              onChangeText={setNlInput}
              multiline
            />
            <TouchableOpacity
              className="bg-[#3B5998] rounded-[10px] py-3.5 items-center mb-2"
              onPress={createWorkflow}
              disabled={createMutation.isPending}
              style={createMutation.isPending ? { opacity: 0.6 } : undefined}
            >
              <Text className="text-white text-base font-semibold">
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity className="py-3.5 items-center" onPress={() => setModalVisible(false)}>
              <Text className="text-muted-foreground text-[15px]">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
