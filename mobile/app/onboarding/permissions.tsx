import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius } from '../../src/theme';

interface PermissionCardProps {
  emoji: string;
  emojiBg: string;
  title: string;
  subtitle: string;
  granted: boolean;
  onPress: () => void;
}

function PermissionCard({ emoji, emojiBg, title, subtitle, granted, onPress }: PermissionCardProps) {
  return (
    <View style={styles.permCard}>
      <View style={[styles.emojiCircle, { backgroundColor: emojiBg }]}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.permText}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permSubtitle}>{subtitle}</Text>
      </View>
      <TouchableOpacity
        onPress={onPress}
        style={[styles.permButton, granted && styles.permButtonGranted]}
        activeOpacity={0.7}
      >
        {granted ? (
          <>
            <Ionicons name="checkmark" size={14} color="#FFFFFF" />
            <Text style={styles.permButtonTextGranted}>Done</Text>
          </>
        ) : (
          <Text style={styles.permButtonText}>Allow</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function PermissionsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState(false);
  const [contacts, setContacts] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [location, setLocation] = useState(false);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={6} />
      <View style={styles.content}>
        <View style={styles.spacer} />
        <PipCard
          expression="love"
          message="I need a few permissions to help you out!"
          size="small"
        />
        <View style={styles.permissions}>
          <PermissionCard
            emoji="🔔"
            emojiBg={colors.primary}
            title="Notifications"
            subtitle="So I can ping you"
            granted={notifications}
            onPress={() => setNotifications(true)}
          />
          <PermissionCard
            emoji="👥"
            emojiBg={colors.purple}
            title="Contacts"
            subtitle="To manage your people"
            granted={contacts}
            onPress={() => setContacts(true)}
          />
          <PermissionCard
            emoji="📅"
            emojiBg={colors.accent}
            title="Calendar"
            subtitle="To schedule your life"
            granted={calendar}
            onPress={() => setCalendar(true)}
          />
          <PermissionCard
            emoji="📍"
            emojiBg={colors.orange}
            title="Location"
            subtitle="For local recommendations"
            granted={location}
            onPress={() => setLocation(true)}
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
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emojiCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  emoji: { fontSize: 18 },
  permText: { flex: 1 },
  permTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  permSubtitle: { color: colors.textMuted, fontSize: 13 },
  permButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  permButtonGranted: {
    backgroundColor: colors.success,
  },
  permButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  permButtonTextGranted: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
