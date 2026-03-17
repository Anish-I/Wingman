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
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/api';
import PipCard from '../../src/PipCard';
import { colors, spacing, radius, shadows } from '../../src/theme';
import type { Workflow } from '../../src/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function getTriggerIcon(type: string): { icon: IconName; color: string } {
  switch (type) {
    case 'schedule': return { icon: 'time', color: colors.orange };
    case 'event': return { icon: 'flash', color: colors.purple };
    default: return { icon: 'hand-left', color: colors.primaryLight };
  }
}

export default function WorkflowsScreen() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

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
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { workflow } = await api.workflows.create({
        name: newName.trim(),
        description: newDesc.trim(),
        trigger_type: 'manual',
        actions: [],
      });
      setWorkflows((prev) => [...prev, workflow]);
      setModalVisible(false);
      setNewName('');
      setNewDesc('');
    } catch (err: unknown) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not create workflow.');
    } finally {
      setCreating(false);
    }
  }

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
        <View>
          <Text style={styles.title}>Workflows</Text>
          <Text style={styles.subtitle}>Your smart workflows</Text>
        </View>
      </View>

      <FlatList
        data={workflows}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <PipCard
              expression="thinking"
              message="No workflows yet. Create your first workflow!"
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
                <View style={[styles.triggerCircle, { backgroundColor: trigger.color + '20' }]}>
                  <Ionicons name={trigger.icon} size={20} color={trigger.color} />
                </View>
                <View style={styles.cardInfo}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  {item.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
                  ) : null}
                </View>
                <Switch
                  value={item.active}
                  onValueChange={(v) => toggleWorkflow(item.id, v)}
                  trackColor={{ false: colors.border, true: colors.success }}
                  thumbColor="#fff"
                />
              </View>
              <View style={styles.cardBottom}>
                <View style={styles.pill}>
                  <Ionicons name={trigger.icon} size={11} color={trigger.color} />
                  <Text style={styles.pillText}>{item.trigger_type}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Workflow</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Description (optional)"
              placeholderTextColor={colors.textMuted}
              value={newDesc}
              onChangeText={setNewDesc}
              multiline
            />
            <TouchableOpacity
              style={[styles.modalBtn, creating && { opacity: 0.6 }]}
              onPress={createWorkflow}
              disabled={creating}
            >
              <Text style={styles.modalBtnText}>{creating ? 'Creating\u2026' : 'Create'}</Text>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: 100 },

  // Empty state
  emptyContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: spacing.lg },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    marginTop: spacing.lg,
  },
  emptyCreateText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  // Workflow cards
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  triggerCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1 },
  cardName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cardDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.cardElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: spacing.lg },
  modalInput: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: 14,
    color: colors.text,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalCancel: { paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontSize: 15 },
});
