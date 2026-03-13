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
} from 'react-native';
import { api } from '../../src/api';
import type { Workflow } from '../../src/types';

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
        <ActivityIndicator color="#6c63ff" style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Workflows</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={workflows}
        keyExtractor={(w) => w.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No workflows yet. Tap + to create one.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.rowDesc}>{item.description}</Text>
              ) : null}
              <Text style={styles.rowMeta}>{item.trigger_type}</Text>
            </View>
            <Switch
              value={item.active}
              onValueChange={(v) => toggleWorkflow(item.id, v)}
              trackColor={{ false: '#333', true: '#6c63ff' }}
              thumbColor="#fff"
            />
          </View>
        )}
      />
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Workflow</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              placeholderTextColor="#555"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={[styles.modalInput, { height: 80 }]}
              placeholder="Description (optional)"
              placeholderTextColor="#555"
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
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  title: { color: '#e0e0ff', fontSize: 22, fontWeight: '700' },
  addBtn: {
    backgroundColor: '#6c63ff',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 24, fontWeight: '400', marginTop: -2 },
  list: { padding: 16, gap: 8 },
  empty: { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  rowInfo: { flex: 1 },
  rowName: { color: '#e0e0ff', fontSize: 16, fontWeight: '600' },
  rowDesc: { color: '#888', fontSize: 13, marginTop: 2 },
  rowMeta: { color: '#6c63ff', fontSize: 11, marginTop: 4, textTransform: 'uppercase' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modal: { backgroundColor: '#0f0f1a', borderRadius: 24, padding: 24, margin: 8 },
  modalTitle: { color: '#e0e0ff', fontSize: 20, fontWeight: '700', marginBottom: 20 },
  modalInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    color: '#e0e0ff',
    fontSize: 15,
    marginBottom: 12,
  },
  modalBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalCancel: { paddingVertical: 14, alignItems: 'center' },
  modalCancelText: { color: '#888', fontSize: 15 },
});
