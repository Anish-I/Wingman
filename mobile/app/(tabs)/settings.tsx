import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import PipCard from '../../src/PipCard';
import { clearToken } from '../../src/auth';
import { colors } from '../../src/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    Alert.alert('Log out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          await clearToken();
          router.replace('/onboarding/welcome');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <PipCard
        expression="wave"
        message={"Need help?\nJust text me."}
        style={styles.pip}
      />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowLabel}>Phone Number</Text>
          <Text style={styles.rowValue}>Tap to view</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowLabel}>Timezone</Text>
          <Text style={styles.rowValue}>Auto-detect</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row}>
          <Text style={styles.rowLabel}>Set PIN</Text>
          <Text style={styles.rowArrow}>{'\u203A'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>1.0.0</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.logoutBtn, loading && { opacity: 0.6 }]}
        onPress={handleLogout}
        disabled={loading}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pip: { marginHorizontal: 16, marginTop: 8 },
  section: { marginHorizontal: 16, marginTop: 24 },
  sectionTitle: { color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 4,
  },
  rowLabel: { color: colors.text, fontSize: 16 },
  rowValue: { color: colors.textMuted, fontSize: 14 },
  rowArrow: { color: colors.textMuted, fontSize: 18 },
  logoutBtn: {
    margin: 24,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 'auto',
  },
  logoutText: { color: colors.error, fontSize: 16, fontWeight: '600' },
});
