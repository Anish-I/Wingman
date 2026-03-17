import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Switch,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import PipCard from '../../src/PipCard';
import { colors, spacing, radius, shadows, gradients } from '../../src/theme';
import type { Workflow } from '../../src/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TRIGGER_OPTIONS: { type: string; icon: IconName; label: string; color: string }[] = [
  { type: 'manual', icon: 'hand-left', label: 'Manual', color: colors.primaryLight },
  { type: 'schedule', icon: 'time', label: 'Scheduled', color: colors.orange },
  { type: 'event', icon: 'flash', label: 'Event', color: colors.purple },
];

function getTriggerIcon(type: string): { icon: IconName; color: string; label: string } {
  const found = TRIGGER_OPTIONS.find(t => t.type === type);
  return found || { icon: 'hand-left', color: colors.primaryLight, label: 'Manual' };
}

export default function WorkflowsScreen() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTrigger, setNewTrigger] = useState('manual');
  const [creating, setCreating] = useState(false);
  const [nameError, setNameError] = useState('');

  async function fetchWorkflows() {
    try {
      const { workflows: wf } = await api.workflows.list();
      setWorkflows(wf);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { fetchWorkflows(); }, []);

  async function toggleWorkflow(id: string, active: boolean) {
    try {
      await api.workflows.update(id, { active });
      setWorkflows((prev) =>
        prev.map((w) => (w.id === id ? { ...w, active } : w))
      );
    } catch {
      Alert.alert('Error', 'Could not update workflow.');
    }
  }

  async function createWorkflow() {
    if (!newName.trim()) {
      setNameError('Workflow name is required');
      return;
    }
    setNameError('');
    setCreating(true);
    try {
      const { workflow } = await api.workflows.create({
        name: newName.trim(),
        description: newDesc.trim(),
        trigger_type: newTrigger as 'manual' | 'schedule' | 'event',
        actions: [],
      });
      setWorkflows((prev) => [...prev, workflow]);
      setModalVisible(false);
      setNewName('');
      setNewDesc('');
      setNewTrigger('manual');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create workflow.');
    } finally {
      setCreating(false);
    }
  }

  const activeCount = workflows.filter(w => w.active).length;
  const successRate = workflows.length > 0 ? Math.round((activeCount / workflows.length) * 100) : 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Workflows</Text>
      </View>

      {/* Stats pills row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsRow}
      >
        <View style={styles.statPill}>
          <Text style={styles.statValue}>{workflows.length}</Text>
          <Text style={styles.statLabel}>Total Runs</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statValue, { color: colors.teal }]}>{activeCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statValue, { color: colors.success }]}>{successRate}%</Text>
          <Text style={styles.statLabel}>Success</Text>
        </View>
      </ScrollView>

      <FlatList
        data={workflows}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <PipCard
              expression="thinking"
              message="No workflows yet. Create your first!"
              size="small"
            />
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.emptyCreateText}>Create Workflow</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const trigger = getTriggerIcon(item.trigger_type);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <View style={[styles.triggerBadge, { backgroundColor: trigger.color + '15' }]}>
                    <Ionicons name={trigger.icon} size={12} color={trigger.color} />
                    <Text style={[styles.triggerBadgeText, { color: trigger.color }]}>{trigger.label}</Text>
                  </View>
                </View>
                <Switch
                  value={item.active}
                  onValueChange={(v) => toggleWorkflow(item.id, v)}
                  trackColor={{ false: colors.border, true: colors.success }}
                  thumbColor="#fff"
                />
              </View>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              ) : null}
            </View>
          );
        }}
      />

      {/* Purple FAB */}
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
        style={styles.fabWrapper}
      >
        <LinearGradient
          colors={gradients.purple}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>

      {/* Create Modal (bottom sheet) */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>New Workflow</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Workflow name"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={(t) => { setNewName(t); if (t.trim()) setNameError(''); }}
            />
            {nameError ? <Text style={styles.nameError}>{nameError}</Text> : null}

            {/* Trigger picker */}
            <Text style={styles.triggerLabel}>Trigger</Text>
            <View style={styles.triggerRow}>
              {TRIGGER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.type}
                  style={[
                    styles.triggerOption,
                    newTrigger === opt.type && styles.triggerOptionActive,
                  ]}
                  onPress={() => setNewTrigger(opt.type)}
                >
                  <Ionicons name={opt.icon} size={18} color={newTrigger === opt.type ? colors.primary : colors.textSecondary} />
                  <Text style={[
                    styles.triggerOptionText,
                    newTrigger === opt.type && { color: colors.primary },
                  ]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.textMuted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />

            <TouchableOpacity
              onPress={createWorkflow}
              disabled={creating}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={gradients.purple}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.modalBtn, creating && { opacity: 0.6 }]}
              >
                <Text style={styles.modalBtnText}>{creating ? 'Creating\u2026' : 'Create Workflow'}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },

  // Stats pills
  statsRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  statPill: {
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 100,
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },

  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 100 },

  // Empty state
  emptyContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: spacing.lg },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    marginTop: spacing.lg,
  },
  emptyCreateText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  // Workflow cards
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardInfo: { flex: 1, gap: 6 },
  cardName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cardDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 8 },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  triggerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // FAB
  fabWrapper: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    ...shadows.lg,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.cardElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: spacing.lg },
  modalInput: {
    backgroundColor: colors.card,
    borderRadius: radius.button,
    padding: 14,
    color: colors.text,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nameError: {
    color: colors.error,
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 4,
  },
  triggerLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  triggerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  triggerOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.button,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  triggerOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  triggerOptionText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  modalBtn: {
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalCancel: { paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontSize: 15 },
});
