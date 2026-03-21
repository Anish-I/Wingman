import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Switch, Modal, TextInput, Alert, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { showMessage } from 'react-native-flash-message';
import PipCard from '@/components/wingman/pip-card';
import { useWorkflows, useCreateWorkflow, usePlanWorkflow, useUpdateWorkflow } from '@/features/workflows/api';
import type { Workflow } from '@/types';
import { headerEntrance, entrance, slideIn, popIn, pressStyle, chipPressStyle, cardPressStyle, springs, webInteractive, webHoverStyle, webFocusRing } from '@/lib/motion';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    showMessage({ message: title, description: message, type: 'danger', duration: 3000 });
  } else {
    Alert.alert(title, message);
  }
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function getTriggerIcon(type: string): { icon: IconName; color: string; label: string } {
  switch (type) {
    case 'schedule': return { icon: 'time', color: '#F5A623', label: 'Scheduled' };
    case 'event': return { icon: 'flash', color: '#7C5CFC', label: 'Event' };
    default: return { icon: 'hand-left', color: '#7C5CFC', label: 'Manual' };
  }
}

const TEMPLATES = [
  { icon: '📧', title: 'Morning email digest', color: '#7C5CFC' },
  { icon: '📅', title: 'Daily calendar summary', color: '#F5A623' },
  { icon: '💬', title: 'Slack standup reminder', color: '#7C5CFC' },
  { icon: '🐙', title: 'GitHub PR notifications', color: '#6EC6B8' },
];

export default function WorkflowsScreen() {
  const { data, isLoading, refetch } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const planMutation = usePlanWorkflow();
  const updateMutation = useUpdateWorkflow();
  const [modalVisible, setModalVisible] = useState(false);
  const [nlInput, setNlInput] = useState('');

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimedOut(true), 20000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const workflows = data?.workflows ?? [];
  const isPending = planMutation.isPending || createMutation.isPending;

  function friendlyError(err: unknown, action: string): string {
    const e = err as any;
    const apiMsg = e?.response?.data?.error || e?.response?.data?.message;
    if (apiMsg) return apiMsg;
    if (e?.code === 'ECONNABORTED' || e?.message?.includes('timeout')) {
      return `Request timed out while trying to ${action}. Check your connection and try again.`;
    }
    if (e?.response?.status === 401 || e?.response?.status === 403) {
      return `Your session may have expired. Try signing out and back in.`;
    }
    if (!e?.response && e?.request) {
      return `Network error — check your internet connection and try again.`;
    }
    return `Could not ${action}. Please try again later.`;
  }

  async function toggleWorkflow(id: string, active: boolean) {
    try {
      await updateMutation.mutateAsync({ id, patch: { active } });
      refetch();
    } catch (err) {
      showAlert('Update Failed', friendlyError(err, active ? 'enable workflow' : 'disable workflow'));
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
        showAlert('Creation Failed', friendlyError(err, 'create workflow'));
      }
    }
  }

  if (isLoading) {
    if (loadingTimedOut) {
      return (
        <SafeAreaView className="flex-1 bg-background justify-center items-center px-6">
          <Ionicons name="cloud-offline-outline" size={40} color="#8E8E9A" />
          <Text className="text-foreground text-base font-bold mt-4">
            Failed to load
          </Text>
          <Text className="text-[#8E8E9A] text-sm text-center mt-1">
            This is taking longer than expected. Check your connection and try again.
          </Text>
          <Pressable
            className="mt-5 bg-[#7C5CFC] rounded-xl px-6 py-3"
            onPress={() => { setLoadingTimedOut(false); refetch(); }}
          >
            <Text className="text-white text-sm font-bold">Retry</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center">
        <MotiView
          from={{ rotate: '0deg' }}
          animate={{ rotate: '360deg' }}
          transition={{ type: 'timing', duration: 1000, loop: true }}
        >
          <Ionicons name="sync" size={32} color="#7C5CFC" />
        </MotiView>
        <Text className="text-[#7C5CFC] text-sm font-semibold mt-3">Loading workflows...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <MotiView
        {...headerEntrance}
        className="px-6 pt-6 pb-2"
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-[28px] font-extrabold">Automations</Text>
            <Text className="text-[#8E8E9A] text-sm mt-0.5">Let Pip handle the boring stuff</Text>
          </View>
          <MotiView
            {...popIn(0, 200)}
          >
            <View className="bg-[#7C5CFC]/15 rounded-2xl px-4 py-2 items-center">
              <Text className="text-[#7C5CFC] text-[20px] font-extrabold">{workflows.length}</Text>
              <Text className="text-[#7C5CFC] text-[10px] font-bold uppercase">Active</Text>
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
                {...popIn(0, 200)}
                className="items-center mb-6"
              >
                <PipCard expression="thinking" size="small" />
                <Text className="text-foreground text-lg font-bold mt-2">No automations yet</Text>
                <Text className="text-[#8E8E9A] text-sm text-center mt-1">
                  Tell me what to automate, or try a template:
                </Text>
              </MotiView>

              {/* Quick templates */}
              <View style={{ gap: 8 }}>
                {TEMPLATES.map((t, i) => (
                  <MotiView
                    key={t.title}
                    {...slideIn(i, 350)}
                  >
                    <Pressable
                      className="flex-row items-center bg-[#141416] rounded-2xl p-4 gap-3 border border-[#262630]"
                      onPress={() => createWorkflow(t.title)}
                      style={({ pressed, hovered }: any) => [
                        ...pressStyle({ pressed }),
                        webInteractive(),
                        Platform.OS === 'web' && hovered && !pressed
                          ? { borderColor: `${t.color}40`, boxShadow: `0 2px 10px ${t.color}18` } as any
                          : undefined,
                      ]}
                    >
                      <View
                        className="w-10 h-10 rounded-xl items-center justify-center"
                        style={{ backgroundColor: t.color + '20' }}
                      >
                        <Text className="text-xl">{t.icon}</Text>
                      </View>
                      <Text className="text-foreground text-[14px] font-semibold flex-1">{t.title}</Text>
                      <Ionicons name="add-circle" size={22} color={t.color} />
                    </Pressable>
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
              {...entrance(index, 100)}
            >
              <View className="bg-[#141416] rounded-2xl p-4 gap-3 border border-[#262630]">
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
                      <Text className="text-[#8E8E9A] text-[13px] mt-0.5" numberOfLines={2}>{item.description}</Text>
                    ) : null}
                  </View>
                  <Switch
                    value={item.active}
                    onValueChange={(v) => toggleWorkflow(item.id, v)}
                    trackColor={{ false: '#1C1C20', true: '#32D74B' }}
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
        from={{ opacity: 0, scale: 0, rotate: '45deg' }}
        animate={{ opacity: 1, scale: 1, rotate: '0deg' }}
        transition={{ ...springs.bouncy, delay: 500 }}
        className="absolute bottom-6 right-6"
      >
        <Pressable
          className="w-14 h-14 rounded-2xl shadow-lg overflow-hidden"
          onPress={() => setModalVisible(true)}
          style={({ pressed }) => [
            ...pressStyle({ pressed }),
            webInteractive(),
          ]}
        >
          <LinearGradient
            colors={['#7C5CFC', '#6545DB', '#4F32B3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="sparkles" size={24} color="#FFFFFF" />
          </LinearGradient>
        </Pressable>
      </MotiView>

      {/* NL Input Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-[#141416] rounded-t-[24px] p-6 pb-12 border-t border-[#262630]">
            <View className="flex-row items-center gap-3 mb-5">
              <View className="w-10 h-10 rounded-xl bg-[#7C5CFC]/20 items-center justify-center">
                <Ionicons name="sparkles" size={20} color="#7C5CFC" />
              </View>
              <View>
                <Text className="text-foreground text-lg font-bold">New Automation</Text>
                <Text className="text-[#8E8E9A] text-xs">Describe it in plain English</Text>
              </View>
            </View>
            <TextInput
              className="bg-[#141416] rounded-2xl p-4 text-foreground text-[15px] mb-4 border border-[#262630]"
              style={{ textAlignVertical: 'top', minHeight: 100 }}
              placeholder="e.g., Every morning, summarize my calendar in Slack..."
              placeholderTextColor="#55556A"
              value={nlInput}
              onChangeText={setNlInput}
              multiline
              autoFocus
            />
            <Pressable
              className="rounded-2xl py-4 items-center mb-2 overflow-hidden"
              onPress={() => createWorkflow()}
              disabled={isPending || !nlInput.trim()}
              style={({ pressed }) => [
                { opacity: isPending || !nlInput.trim() ? 0.5 : 1 },
                ...pressStyle({ pressed }),
                webInteractive(isPending || !nlInput.trim()),
              ]}
            >
              <LinearGradient
                colors={['#7C5CFC', '#6545DB']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
              <Text className="text-white text-base font-bold">
                {isPending ? 'Creating magic...' : 'Create Automation'}
              </Text>
            </Pressable>
            <Pressable
              className="py-3 items-center"
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [
                ...chipPressStyle({ pressed }),
                webInteractive(),
              ]}
            >
              <Text className="text-[#8E8E9A] text-[15px] font-medium">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
