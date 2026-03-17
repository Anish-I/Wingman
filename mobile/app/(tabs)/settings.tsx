import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { clearToken, getToken } from '../../src/auth';
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
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  badge?: string;
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
  toggle,
  toggleValue,
  onToggle,
  badge,
}: SettingsRowProps) {
  const labelColor = destructive ? colors.error : colors.text;
  const resolvedIconColor = destructive ? colors.error : iconColor;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.row,
          isFirst && { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card },
          isLast && { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card },
        ]}
        onPress={onPress}
        activeOpacity={onPress ? 0.6 : 1}
        disabled={!onPress && !toggle}
      >
        <View style={[styles.rowIconBox, destructive && { backgroundColor: colors.errorMuted }]}>
          <Ionicons name={icon} size={18} color={resolvedIconColor} />
        </View>
        <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
        <View style={styles.rowRight}>
          {badge ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{badge}</Text>
            </View>
          ) : null}
          {value ? <Text style={styles.rowValue}>{value}</Text> : null}
          {toggle ? (
            <Switch
              value={toggleValue}
              onValueChange={onToggle}
              trackColor={{ false: colors.border, true: colors.success }}
              thumbColor="#fff"
            />
          ) : showChevron ? (
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          ) : null}
        </View>
      </TouchableOpacity>
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function formatPhone(phone: string): string {
  if (phone.length === 12 && phone.startsWith('+1')) {
    return `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
  }
  return phone;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; phone: string } | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      const payload = decodeJwtPayload(token);
      if (payload) {
        setUser({
          name: (payload.name as string) || 'User',
          phone: (payload.phone as string) || '',
        });
      }
    })();
  }, []);

  async function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await clearToken();
          router.replace('/onboarding/login');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile header */}
        <View style={styles.profileSection}>
          <View style={styles.avatarCircle}>
            {user ? (
              <Text style={styles.avatarInitial}>
                {user.name.charAt(0).toUpperCase()}
              </Text>
            ) : (
              <Ionicons name="person" size={28} color={colors.textMuted} />
            )}
          </View>
          {user ? (
            <>
              <Text style={styles.username}>{user.name}</Text>
              <Text style={styles.phone}>{user.phone ? formatPhone(user.phone) : ''}</Text>
            </>
          ) : (
            <ActivityIndicator color={colors.textMuted} style={{ marginTop: spacing.xs }} />
          )}
        </View>

        {/* Settings sections */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <SettingsRow
              icon="notifications-outline"
              iconColor={colors.orange}
              label="Notifications"
              toggle
              toggleValue={notificationsOn}
              onToggle={setNotificationsOn}
              showChevron={false}
              isFirst
            />
            <SettingsRow
              icon="apps-outline"
              iconColor={colors.primaryLight}
              label="Connected Apps"
              badge="0"
              isLast
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <SettingsRow icon="shield-outline" iconColor={colors.textSecondary} label="Privacy" isFirst />
            <SettingsRow icon="help-circle-outline" iconColor={colors.teal} label="Help & Support" isLast />
          </View>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <View style={styles.sectionCard}>
            <SettingsRow
              icon="log-out-outline"
              label="Sign Out"
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarInitial: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  username: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  phone: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },

  // Sections
  section: { marginTop: spacing.md, paddingHorizontal: spacing.md },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
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
  countBadge: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 4,
  },
  countBadgeText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },

  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: 56,
  },
});
