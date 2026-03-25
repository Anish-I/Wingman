import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, Switch, Modal, TextInput, Alert, Platform, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { showMessage } from 'react-native-flash-message';
import PipCard from '@/components/wingman/pip-card';
import { useWorkflows, useCreateWorkflow, usePlanWorkflow, useUpdateWorkflow } from '@/features/workflows/api';
import type { Workflow } from '@/types';
import { base, layout, purple, radii, semantic, spacing, useThemeColors } from '@/components/ui/tokens';
import { headerEntrance, entrance, slideIn, popIn, pressStyle, chipPressStyle, cardPressStyle, springs, delays, webInteractive, webHoverStyle, focusRing, useReducedMotion, maybeReduce } from '@/lib/motion';

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
    case 'event': return { icon: 'flash', color: purple[500], label: 'Event' };
    default: return { icon: 'hand-left', color: purple[500], label: 'Manual' };
  }
}

const TEMPLATES = [
  { icon: '📧', title: 'Morning email digest', color: purple[500] },
  { icon: '📅', title: 'Daily calendar summary', color: '#F5A623' },
  { icon: '💬', title: 'Slack standup reminder', color: purple[500] },
  { icon: '🐙', title: 'GitHub PR notifications', color: '#6EC6B8' },
];

export default function WorkflowsScreen() {
  const { surface, text: t } = useThemeColors();
  const reduced = useReducedMotion();
  const { data, isLoading, error: fetchError, refetch } = useWorkflows();
  const createMutation = useCreateWorkflow();
  const planMutation = usePlanWorkflow();
  const updateMutation = useUpdateWorkflow();
  const [modalVisible, setModalVisible] = useState(false);
  const [nlInput, setNlInput] = useState('');
  const modalContentRef = useRef<View>(null);

  // Theme-dependent overrides (static layout in StyleSheet below)
  const s = {
    skeletonCardBg: { backgroundColor: surface.card },
    skeletonSectionBg: { backgroundColor: surface.section },
    mutedText: { color: t.muted },
    slowHintBg: styles.slowHintBg,
    slowHintIcon: styles.slowHintIcon,
    slowHintText: styles.slowHintText,
    workflowCard: [styles.workflowCard, { backgroundColor: surface.card, borderColor: surface.border }],
    templateCardBase: [styles.templateCardBase, { backgroundColor: surface.card, borderColor: surface.border }],
    modalContent: [styles.modalContent, { backgroundColor: surface.card, borderTopColor: surface.border }],
    modalInput: [styles.modalInput, { backgroundColor: surface.section, borderColor: surface.border }],
    activeStatusColor: { color: semantic.success },
    inactiveStatusColor: { color: t.muted },
    switchTrackColor: { false: surface.elevated, true: semantic.success },
    togglingSwitch: styles.togglingSwitch,
  };

  // Trap keyboard focus within the modal on web
  useEffect(() => {
    if (Platform.OS !== 'web' || !modalVisible) return;
    const el = modalContentRef.current as unknown as HTMLElement | null;
    if (!el) return;

    function getFocusable(root: HTMLElement): HTMLElement[] {
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setModalVisible(false);
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = getFocusable(el!);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (!el!.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalVisible]);

  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      setLoadingSlow(false);
      return;
    }
    // Show "slow" hint early so users know something is happening
    const slowTimer = setTimeout(() => setLoadingSlow(true), 3000);
    // Treat as failed after 8 seconds — most users abandon before 10s
    const failTimer = setTimeout(() => setLoadingTimedOut(true), 8000);
    return () => { clearTimeout(slowTimer); clearTimeout(failTimer); };
  }, [isLoading]);

  const workflows = data?.workflows ?? [];
  const isPending = planMutation.isPending || createMutation.isPending;

  function friendlyError(err: unknown, action: string): string {
    const e = err as any;
    const rawApiMsg = e?.response?.data?.error;
    const apiMsg =
      typeof rawApiMsg === 'object' && rawApiMsg !== null
        ? rawApiMsg.message ?? JSON.stringify(rawApiMsg)
        : rawApiMsg || e?.response?.data?.message;
    if (apiMsg) return String(apiMsg);
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
    setTogglingIds((prev) => new Set(prev).add(id));
    try {
      await updateMutation.mutateAsync({ id, patch: { active } });
      await refetch();
    } catch (err) {
      showAlert('Update Failed', friendlyError(err, active ? 'enable workflow' : 'disable workflow'));
      await refetch();
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  if (fetchError || (isLoading && loadingTimedOut)) {
    return (
      <SafeAreaView className="flex-1 bg-background justify-center items-center" style={{ paddingHorizontal: layout.screenPaddingH }}>
        <Ionicons name="cloud-offline-outline" size={40} color={t.muted} />
        <Text className="text-foreground text-base font-bold" style={{ marginTop: spacing.lg }}>
          Failed to load
        </Text>
        <Text style={[s.mutedText, { marginTop: spacing.xs }]} className="text-sm text-center">
          {fetchError
            ? 'Could not load workflows. Check your connection and try again.'
            : 'This is taking longer than expected. Check your connection and try again.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading workflows"
          className="bg-pip-purple rounded-xl"
          style={{ marginTop: spacing.xl, paddingHorizontal: layout.screenPaddingH, paddingVertical: spacing.md }}
          onPress={() => { setLoadingTimedOut(false); refetch(); }}
        >
          <Text className="text-white text-sm font-bold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    const pulse = reduced ? {} : {
      from: { opacity: 0.35 },
      animate: { opacity: 0.75 },
      transition: { type: 'timing' as const, duration: 900, loop: true },
    };
    return (
      <SafeAreaView className="flex-1 bg-background">
        {/* Slow-loading hint */}
        {loadingSlow && (
          <View className="rounded-xl flex-row items-center" style={[s.slowHintBg, { marginHorizontal: layout.screenPaddingH, marginTop: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }]}>
            <Ionicons name="time-outline" size={18} color="#F5A623" style={s.slowHintIcon} />
            <Text style={s.slowHintText}>
              Still loading — check your connection if this persists
            </Text>
          </View>
        )}
        {/* Skeleton header */}
        <View style={{ paddingHorizontal: layout.screenPaddingH, paddingTop: layout.screenPaddingTop, paddingBottom: spacing.sm }}>
          <View className="flex-row items-center justify-between">
            <View>
              <MotiView {...pulse} className="h-7 w-40 rounded-lg" style={s.skeletonCardBg} />
              <MotiView {...pulse} className="h-4 w-52 rounded-md" style={[s.skeletonCardBg, { marginTop: spacing.sm }]} />
            </View>
            <MotiView {...pulse} className="w-16 h-14 rounded-2xl" style={s.skeletonCardBg} />
          </View>
        </View>
        {/* Skeleton workflow cards */}
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.sm }}>
          {[0, 1, 2, 3].map((i) => (
            <MotiView key={i} {...pulse} className="rounded-2xl" style={[s.skeletonCardBg, { padding: spacing.lg }]}>
              <View className="flex-row items-center" style={{ gap: spacing.md }}>
                <View className="w-[42px] h-[42px] rounded-xl" style={s.skeletonSectionBg} />
                <View className="flex-1">
                  <View className="h-4 w-40 rounded-md" style={s.skeletonSectionBg} />
                  <View className="h-3 w-56 rounded-md" style={[s.skeletonSectionBg, { marginTop: spacing.sm }]} />
                </View>
                <View className="w-12 h-7 rounded-full" style={s.skeletonSectionBg} />
              </View>
              <View className="flex-row items-center" style={{ gap: spacing.sm, marginTop: spacing.md }}>
                <View className="h-6 w-20 rounded-full" style={s.skeletonSectionBg} />
              </View>
            </MotiView>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <MotiView
        {...maybeReduce(headerEntrance, reduced)}
        style={{ paddingHorizontal: layout.screenPaddingH, paddingTop: layout.screenPaddingTop, paddingBottom: spacing.sm }}
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-foreground text-[28px] font-extrabold">Automations</Text>
            <Text style={[s.mutedText, { marginTop: 2 }]} className="text-sm">Let Pip handle the boring stuff</Text>
          </View>
          <MotiView
            {...maybeReduce(popIn(0, delays.slow), reduced)}
          >
            <View className="bg-pip-purple/15 rounded-2xl items-center" style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
              <Text className="text-pip-purple text-[20px] font-extrabold">{workflows.length}</Text>
              <Text className="text-pip-purple text-[10px] font-bold uppercase">Active</Text>
            </View>
          </MotiView>
        </View>
      </MotiView>

      <FlatList
        data={workflows}
        keyExtractor={(w) => w.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing['3xl'] + spacing.lg + spacing['3xl'] }}
        ListHeaderComponent={
          workflows.length === 0 ? (
            <View style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              {/* Empty state with templates */}
              <MotiView
                {...maybeReduce(popIn(0, delays.slow), reduced)}
                className="items-center"
                style={{ marginBottom: layout.sectionGap }}
              >
                <PipCard expression="thinking" size="small" />
                <Text className="text-foreground text-lg font-bold" style={{ marginTop: spacing.sm }}>No automations yet</Text>
                <Text style={[s.mutedText, { marginTop: spacing.xs }]} className="text-sm text-center">
                  Tell me what to automate, or try a template:
                </Text>
              </MotiView>

              {/* Quick templates */}
              <View style={styles.templateList}>
                {TEMPLATES.map((t, i) => (
                  <MotiView
                    key={t.title}
                    {...maybeReduce(slideIn(i, delays.slow), reduced)}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Create automation: ${t.title}`}
                      className="flex-row items-center rounded-2xl"
                      onPress={() => createWorkflow(t.title)}
                      style={({ pressed, hovered }: any) => [
                        { padding: spacing.lg, gap: spacing.md },
                        s.templateCardBase,
                        ...pressStyle({ pressed }),
                        webInteractive(),
                        Platform.OS === 'web' && hovered && !pressed
                          ? [styles.templateCardHover, { borderColor: `${t.color}40`, boxShadow: `0 2px 10px ${t.color}18` }] as any
                          : undefined,
                      ]}
                    >
                      <View
                        className="w-10 h-10 rounded-xl items-center justify-center"
                        style={[styles.templateIcon, { backgroundColor: t.color + '20' }]}
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
              {...maybeReduce(entrance(index, delays.normal), reduced)}
            >
              <View className="rounded-2xl" style={[s.workflowCard, { padding: spacing.lg, gap: spacing.md }]}>
                <View className="flex-row items-center" style={{ gap: spacing.md }}>
                  <View
                    className="w-[42px] h-[42px] rounded-xl items-center justify-center"
                    style={[styles.triggerIcon, { backgroundColor: trigger.color + '20' }]}
                  >
                    <Ionicons name={trigger.icon} size={20} color={trigger.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground text-base font-bold">{item.name}</Text>
                    {item.description ? (
                      <Text style={[s.mutedText, { marginTop: 2 }]} className="text-[13px]" numberOfLines={2}>{item.description}</Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center" style={{ gap: spacing.xs + 2 }}>
                    <Text
                      style={item.active ? s.activeStatusColor : s.inactiveStatusColor}
                      className="text-[11px] font-semibold"
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    >
                      {item.active ? 'ON' : 'OFF'}
                    </Text>
                    <Switch
                      value={item.active}
                      onValueChange={(v) => toggleWorkflow(item.id, v)}
                      disabled={togglingIds.has(item.id)}
                      trackColor={s.switchTrackColor}
                      thumbColor="#fff"
                      accessibilityLabel={`${item.name} is ${item.active ? 'on' : 'off'}`}
                      accessibilityRole="switch"
                      style={togglingIds.has(item.id) ? s.togglingSwitch : undefined}
                    />
                  </View>
                </View>
                {/* Trigger badge */}
                <View className="flex-row items-center" style={{ gap: spacing.sm }}>
                  <View
                    className="rounded-full flex-row items-center"
                    style={[styles.triggerBadge, { backgroundColor: trigger.color + '15', paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs, gap: spacing.xs }]}
                  >
                    <Ionicons name={trigger.icon} size={12} color={trigger.color} />
                    <Text style={[styles.triggerBadgeText, { color: trigger.color }]}>{trigger.label}</Text>
                  </View>
                  {item.active && (
                    <View className="rounded-full bg-[#4ADE80]/15 flex-row items-center" style={{ paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs, gap: spacing.xs }}>
                      <View className="w-1.5 h-1.5 rounded-full bg-[#4ADE80]" />
                      <Text className="text-[#4ADE80] text-[11px] font-semibold">Running</Text>
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
        {...maybeReduce({
          from: { opacity: 0, scale: 0, rotate: '45deg' },
          animate: { opacity: 1, scale: 1, rotate: '0deg' },
          transition: { ...springs.bouncier, delay: delays.slow },
        }, reduced)}
        className="absolute"
        style={{ bottom: spacing['2xl'], right: spacing['2xl'] }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create new automation"
          className="w-14 h-14 rounded-2xl shadow-lg overflow-hidden"
          onPress={() => setModalVisible(true)}
          style={({ pressed }) => [
            ...pressStyle({ pressed }),
            webInteractive(),
          ]}
        >
          <LinearGradient
            colors={[purple[500], purple[600], purple[700]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <Ionicons name="sparkles" size={24} color={base.white} />
          </LinearGradient>
        </Pressable>
      </MotiView>

      {/* NL Input Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View className="flex-1 bg-black/70 justify-end">
          <View
            ref={modalContentRef}
            style={s.modalContent}
            {...(Platform.OS === 'web' ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'New Automation' } as any : {})}
          >
            <View className="flex-row items-center" style={{ gap: spacing.md, marginBottom: spacing.xl }}>
              <View className="w-10 h-10 rounded-xl bg-pip-purple/20 items-center justify-center">
                <Ionicons name="sparkles" size={20} color={purple[500]} />
              </View>
              <View>
                <Text className="text-foreground text-lg font-bold">New Automation</Text>
                <Text style={s.mutedText} className="text-xs">Describe it in plain English</Text>
              </View>
            </View>
            <TextInput
              className="rounded-2xl text-foreground text-[15px]"
              style={[s.modalInput, { padding: spacing.lg, marginBottom: spacing.lg }]}
              placeholder="e.g., Every morning, summarize my calendar in Slack..."
              placeholderTextColor={t.muted}
              value={nlInput}
              onChangeText={setNlInput}
              multiline
              autoFocus
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPending ? 'Creating automation' : 'Create automation'}
              className="rounded-2xl items-center overflow-hidden"
              onPress={() => createWorkflow()}
              disabled={isPending || !nlInput.trim()}
              style={({ pressed }) => [
                { paddingVertical: spacing.lg, marginBottom: spacing.sm },
                isPending || !nlInput.trim() ? styles.disabledOpacity : undefined,
                ...pressStyle({ pressed }),
                webInteractive(isPending || !nlInput.trim()),
              ]}
            >
              <LinearGradient
                colors={[purple[500], purple[600]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createButtonGradient}
              />
              <Text className="text-white text-base font-bold">
                {isPending ? 'Creating magic...' : 'Create Automation'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              className="items-center"
              onPress={() => setModalVisible(false)}
              style={({ pressed }) => [
                { paddingVertical: spacing.md },
                ...chipPressStyle({ pressed }),
                webInteractive(),
              ]}
            >
              <Text style={s.mutedText} className="text-[15px] font-medium">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- Extracted from theme-dependent object ---
  slowHintBg: {
    backgroundColor: 'rgba(245, 166, 35, 0.12)',
  },
  slowHintIcon: {
    marginRight: spacing.sm,
  },
  slowHintText: {
    color: '#F5A623',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  workflowCard: {
    borderWidth: 1,
  },
  templateCardBase: {
    borderWidth: 1,
  },
  templateCardHover: {},
  templateIcon: {},
  modalContent: {
    borderTopWidth: 1,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing['2xl'],
    paddingBottom: spacing['3xl'] + spacing.lg,
  },
  modalInput: {
    borderWidth: 1,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  togglingSwitch: {
    opacity: 0.5,
  },
  disabledOpacity: {
    opacity: 0.5,
  },
  triggerIcon: {},
  triggerBadge: {},
  triggerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // --- Original static styles ---
  templateList: {
    gap: spacing.sm,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
