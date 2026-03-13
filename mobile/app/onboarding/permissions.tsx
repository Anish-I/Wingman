import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius } from '../../src/theme';

interface PermissionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}

function PermissionRow({ icon, title, description, value, onToggle }: PermissionRowProps) {
  return (
    <View style={styles.permRow}>
      <View style={styles.permIcon}>
        <Ionicons name={icon} size={22} color={colors.accent} />
      </View>
      <View style={styles.permText}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permDesc}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.text}
      />
    </View>
  );
}

export default function PermissionsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState(true);
  const [calendar, setCalendar] = useState(false);
  const [contacts, setContacts] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={6} />
      <View style={styles.content}>
        <View style={styles.spacer} />
        <PipCard
          expression="love"
          message="A few permissions to make the magic happen"
          size="small"
        />
        <View style={styles.permissions}>
          <PermissionRow
            icon="notifications-outline"
            title="Notifications"
            description="Get updates and reminders"
            value={notifications}
            onToggle={setNotifications}
          />
          <PermissionRow
            icon="calendar-outline"
            title="Calendar"
            description="Manage your schedule"
            value={calendar}
            onToggle={setCalendar}
          />
          <PermissionRow
            icon="people-outline"
            title="Contacts"
            description="Send messages to your contacts"
            value={contacts}
            onToggle={setContacts}
          />
        </View>
        <View style={styles.spacer} />
      </View>
      <View style={styles.footer}>
        <GradientButton
          title="Continue"
          onPress={() => router.push('/onboarding/done')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  spacer: { flex: 1 },
  permissions: { marginTop: spacing.lg, gap: 12 },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  permIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  permText: { flex: 1 },
  permTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: 2 },
  permDesc: { color: colors.textSecondary, fontSize: 13 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
