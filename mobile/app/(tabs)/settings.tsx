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
import { colors, spacing, radius } from '../../src/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface SettingsRowProps {
  icon: IconName;
  iconColor?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

function SettingsRow({
  icon,
  iconColor = colors.textSecondary,
  label,
  value,
  onPress,
  showChevron = true,
  destructive,
  isFirst,
  isLast,
}: SettingsRowProps) {
  const labelColor = destructive ? colors.error : colors.text;
  const resolvedIconColor = destructive ? colors.error : iconColor;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.row,
          isFirst && { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
          isLast && { borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md },
        ]}
        onPress={onPress}
        activeOpacity={onPress ? 0.6 : 1}
        disabled={!onPress}
      >
        <View style={[styles.rowIconBox, destructive && { backgroundColor: colors.errorMuted }]}>
          <Ionicons name={icon} size={18} color={resolvedIconColor} />
        </View>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
        <View style={styles.rowRight}>
          {value ? <Text style={styles.rowValue}>{value}</Text> : null}
          {showChevron && (
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          )}
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.divider} />}
    </>
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
        {/* Profile header */}
        <View style={styles.profileSection}>
          <PipCard expression="wave" size="small" style={styles.pip} />
          <Text style={styles.username}>Pip User</Text>
          <Text style={styles.phone}>Phone number</Text>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <SettingsRow icon="call-outline" iconColor={colors.accent} label="Phone" value="Tap to view" isFirst />
            <SettingsRow icon="time-outline" iconColor={colors.orange} label="Timezone" value="Auto-detect" />
            <SettingsRow icon="lock-closed-outline" iconColor={colors.purple} label="Security" />
            <SettingsRow icon="apps-outline" iconColor={colors.primaryLight} label="Connected Apps" value={`0 apps`} isLast />
          </View>
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.sectionCard}>
            <SettingsRow icon="moon-outline" iconColor={colors.purple} label="Theme" value="Dark" isFirst />
            <SettingsRow icon="notifications-outline" iconColor={colors.orange} label="Notifications" value="On" isLast />
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.sectionCard}>
            <SettingsRow icon="information-circle-outline" iconColor={colors.primaryLight} label="Version" value="1.0.0" showChevron={false} isFirst />
            <SettingsRow icon="chatbubble-outline" iconColor={colors.accent} label="Send Feedback" />
            <SettingsRow icon="shield-outline" iconColor={colors.textSecondary} label="Privacy Policy" isLast />
          </View>
        </View>

        {/* Log out */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <SettingsRow
              icon="log-out-outline"
              label="Log out"
              showChevron={false}
              onPress={handleLogout}
              destructive
              isFirst
              isLast
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

  // Profile
  profileSection: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pip: { marginBottom: 0 },
  username: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  phone: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },

  // Sections
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
    overflow: 'hidden',
  },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: 12,
    backgroundColor: colors.card,
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
