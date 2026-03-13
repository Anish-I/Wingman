import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '../../src/PipCard';
import { clearToken } from '../../src/auth';
import { colors, spacing, radius, shadows } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingsRowProps {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  accent?: boolean;
}

function SettingsRow({ icon, label, value, onPress, showChevron = true, destructive, accent }: SettingsRowProps) {
  const iconColor = destructive ? colors.error : accent ? colors.accent : colors.textSecondary;
  const labelColor = destructive ? colors.error : colors.text;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <View style={[styles.rowIconBox, destructive && { backgroundColor: colors.errorMuted }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {showChevron && (
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        )}
      </View>
    </TouchableOpacity>
  );
}

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
      <ScrollView contentContainerStyle={styles.scroll}>
        <PipCard
          expression="wave"
          message={"Need help?\nJust text me."}
          size="small"
          style={styles.pip}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <SettingsRow icon="call-outline" label="Phone Number" value="Tap to view" />
            <View style={styles.divider} />
            <SettingsRow icon="time-outline" label="Timezone" value="Auto-detect" />
            <View style={styles.divider} />
            <SettingsRow icon="lock-closed-outline" label="Set PIN" />
            <View style={styles.divider} />
            <SettingsRow icon="apps-outline" label="Connected Apps" value="0 apps" accent />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.sectionCard}>
            <SettingsRow icon="moon-outline" label="Theme" value="Dark" />
            <View style={styles.divider} />
            <SettingsRow icon="notifications-outline" label="Notifications" value="On" />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.sectionCard}>
            <SettingsRow icon="information-circle-outline" label="Version" value="1.0.0" showChevron={false} />
            <View style={styles.divider} />
            <SettingsRow icon="chatbubble-outline" label="Send Feedback" />
            <View style={styles.divider} />
            <SettingsRow icon="document-text-outline" label="Privacy Policy" />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <SettingsRow
              icon="log-out-outline"
              label="Log out"
              showChevron={false}
              onPress={handleLogout}
              destructive
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  pip: { marginHorizontal: spacing.md, marginTop: spacing.sm },

  section: { marginTop: spacing.lg, paddingHorizontal: spacing.md },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  rowIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.backgroundElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { color: colors.textMuted, fontSize: 14 },

  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: 56,
  },
});
