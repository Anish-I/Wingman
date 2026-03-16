import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Switch, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import { useWorkflows, useCreateWorkflow, usePlanWorkflow, useUpdateWorkflow } from '@/features/workflows/api';
import type { Workflow } from '@/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function getTriggerIcon(type: string): { icon: IconName; color: string; label: string } {
  switch (type) {
    case 'schedule': return { icon: 'time', color: '#F5A623', label: 'Scheduled' };
    case 'event': return { icon: 'flash', color: '#9B7EC8', label: 'Event' };
    default: return { icon: 'hand-left', color: '#4A7BD9', label: 'Manual' };
  }
}

const TEMPLATES = [
  { icon: '📧', title: 'Morning email digest', color: '#4A7BD9' },
  { icon: '📅', title: 'Daily calendar summary', color: '#F5A623' },
  { icon: '💬', title: 'Slack standup reminder', color: '#9B7EC8' },
  { icon: '🐙', title: 'GitHub PR notifications', color: '#6EC6B8' },
];

export default function WorkflowsScreen() {
  const { data, isLoading, refetch } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const planMutation = usePlanWorkflow();
  const updateMutation = useUpdateWorkflow();
  const [modalVisible, setModalVisible] = useState(false);
  const [nlInput, setNlInput] = useState('');

  const workflows = data?.workflows ?? [];
  const isPending = planMutation.isPending || createMutation.isPending;

  async function toggleWorkflow(id: string, active: boolean) {
    try {
      await updateMutation.mutateAsync({ id, patch: { active } });
      refetch();
    } catch {
      Alert.alert('Error', 'Could not update workflow.');
    }
  }

  async function createWorkflow(description?: string) {
    const text = description || nlInput.trim();
    if (!text) return;
    try {
      await planMutation.mutateAsync({ description: text });
      setModalVisible(false);
      setNlInput('');
      refetch();
    } catch {
      try {
        await createMutation.mutateAsync({
          name: text,
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
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <MotiView
          from={{ rotate: '0deg' }}
          animate={{ rotate: '360deg' }}
          transition={{ type: 'timing', duration: 1000, loop: true }}
        >
          <Ionicons name="sync" size={32} color="#9B7EC8" />
        </MotiView>
        <Text className="text-[#9B7EC8] text-sm font-semibold mt-3">Loading workflows...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <MotiView
        from={{ opacity: 0, translateY: -10 }}
        animate={{ opacity: 1, translateY: 0 }}
        className="px-6 pt-6 pb-2"
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-[28px] font-extrabold">Automations</Text>
            <Text className="text-[#8A8A8A] text-sm mt-0.5">Let Pip handle the boring stuff</Text>
          </View>
          <MotiView
            from={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 10, delay: 200 }}
          >
            <View className="bg-[#9B7EC8]/15 rounded-2xl px-4 py-2 items-center">
              <Text className="text-[#9B7EC8] text-[20px] font-extrabold">{workflows.length}</Text>
              <Text className="text-[#9B7EC8] text-[10px] font-bold uppercase">Active</Text>
            </View>
          </MotiView>
        </View>
      </MotiView>

      <FlatList
        data={workflows}
        keyExtractor={(w) => w.id}
        contentContainerClassName="px-4 gap-3 pb-[100px]"
        ListHeaderComponent={
          workflows.length === 0 ? (
            <View className="mt-4 mb-2">
              {/* Empty state with templates */}
              <MotiView
                from={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 12, delay: 200 }}
                className="items-center mb-6"
              >
                <PipCard expression="thinking" size="small" />
                <Text className="text-foreground text-lg font-bold mt-2">No automations yet</Text>
                <Text className="text-[#8A8A8A] text-sm text-center mt-1">
                  Tell me what to automate, or try a template:
                </Text>
              </MotiView>

              {/* Quick templates */}
              <View style={{ gap: 8 }}>
                {TEMPLATES.map((t, i) => (
                  <MotiView
                    key={t.title}
                    from={{ opacity: 0, translateX: -20 }}
                    animate={{ opacity: 1, translateX: 0 }}
                    transition={{ type: 'spring', damping: 15, delay: 400 + i * 80 }}
                  >
                    <TouchableOpacity
                      className="flex-row items-center bg-[#1A1A1A] rounded-2xl p-4 gap-3 border border-[#2A2A2A]"
                      onPress={() => createWorkflow(t.title)}
                      activeOpacity={0.7}
                    >
                      <View
                        className="w-10 h-10 rounded-xl items-center justify-center"
                        style={{ backgroundColor: t.color + '20' }}
                      >
                        <Text className="text-xl">{t.icon}</Text>
                      </View>
                      <Text className="text-foreground text-[14px] font-semibold flex-1">{t.title}</Text>
                      <Ionicons name="add-circle" size={22} color={t.color} />
                    </TouchableOpacity>
                  </MotiView>
                ))}
              </View>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const trigger = getTriggerIcon(item.trigger_type);
          return (
            <MotiView
              from={{ opacity: 0, translateY: 15 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', damping: 15, delay: index * 60 }}
            >
              <View className="bg-[#1A1A1A] rounded-2xl p-4 gap-3 border border-[#2A2A2A]">
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-[42px] h-[42px] rounded-xl items-center justify-center"
                    style={{ backgroundColor: trigger.color + '20' }}
                  >
                    <Ionicons name={trigger.icon} size={20} color={trigger.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground text-base font-bold">{item.name}</Text>
                    {item.description ? (
                      <Text className="text-[#8A8A8A] text-[13px] mt-0.5" numberOfLines={2}>{item.description}</Text>
                    ) : null}
                  </View>
                  <Switch
                    value={item.active}
                    onValueChange={(v) => toggleWorkflow(item.id, v)}
                    trackColor={{ false: '#242424', true: '#32D74B' }}
                    thumbColor="#fff"
                  />
                </View>
                {/* Trigger badge */}
                <View className="flex-row items-center gap-2">
                  <View
                    className="rounded-full px-2.5 py-1 flex-row items-center gap-1"
                    style={{ backgroundColor: trigger.color + '15' }}
                  >
                    <Ionicons name={trigger.icon} size={12} color={trigger.color} />
                    <Text style={{ color: trigger.color, fontSize: 11, fontWeight: '600' }}>{trigger.label}</Text>
                  </View>
                  {item.active && (
                    <View className="rounded-full px-2.5 py-1 bg-[#32D74B]/15 flex-row items-center gap-1">
                      <View className="w-1.5 h-1.5 rounded-full bg-[#32D74B]" />
                      <Text className="text-[#32D74B] text-[11px] font-semibold">Running</Text>
                    </View>
                  )}
                </View>
              </View>
            </MotiView>
          );
        }}
      />

      {/* FAB */}
      <MotiView
        from={{ scale: 0, rotate: '45deg' }}
        animate={{ scale: 1, rotate: '0deg' }}
        transition={{ type: 'spring', damping: 10, delay: 500 }}
        className="absolute bottom-6 right-6"
      >
        <TouchableOpacity
          className="w-14 h-14 rounded-2xl shadow-lg overflow-hidden"
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#9B7EC8', '#7B5EA8', '#5E4488']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="sparkles" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </MotiView>

      {/* NL Input Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-[#141416] rounded-t-[24px] p-6 pb-12 border-t border-[#2A2A2A]">
            <View className="flex-row items-center gap-3 mb-5">
              <View className="w-10 h-10 rounded-xl bg-[#9B7EC8]/20 items-center justify-center">
                <Ionicons name="sparkles" size={20} color="#9B7EC8" />
              </View>
              <View>
                <Text className="text-foreground text-lg font-bold">New Automation</Text>
                <Text className="text-[#8A8A8A] text-xs">Describe it in plain English</Text>
              </View>
            </View>
            <TextInput
              className="bg-[#1A1A1A] rounded-2xl p-4 text-foreground text-[15px] mb-4 border border-[#2A2A2A]"
              style={{ textAlignVertical: 'top', minHeight: 100 }}
              placeholder="e.g., Every morning, summarize my calendar in Slack..."
              placeholderTextColor="#525252"
              value={nlInput}
              onChangeText={setNlInput}
              multiline
              autoFocus
            />
            <TouchableOpacity
              className="rounded-2xl py-4 items-center mb-2 overflow-hidden"
              onPress={() => createWorkflow()}
              disabled={isPending || !nlInput.trim()}
              style={{ opacity: isPending || !nlInput.trim() ? 0.5 : 1 }}
            >
              <LinearGradient
                colors={['#9B7EC8', '#7B5EA8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
              <Text className="text-white text-base font-bold">
                {isPending ? 'Creating magic...' : 'Create Automation'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity className="py-3 items-center" onPress={() => setModalVisible(false)}>
              <Text className="text-[#8A8A8A] text-[15px] font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
