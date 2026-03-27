import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import * as React from 'react';
import { useState, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { base, useThemeColors, layout, purple, radii, semantic, spacing, teal } from '@/components/ui/tokens';
import { fontScale } from '@/lib/responsive';
import GradientButton from '@/components/wingman/gradient-button';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import SectionLabel from '@/components/wingman/section-label';
import { entrance, chipPressStyle, springs, webInteractive, useReducedMotion, maybeReduce } from '@/lib/motion';

type PermissionItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  accent: string;
  type: 'notifications' | 'coming-soon';
};

const PERMISSIONS: PermissionItem[] = [
  {
    icon: 'notifications-outline',
    title: 'Notifications',
    subtitle: 'Get instant task updates',
    accent: purple[500],
    type: 'notifications',
  },
  {
    icon: 'people-outline',
    title: 'Contacts',
    subtitle: 'Coming soon',
    accent: purple[400],
    type: 'coming-soon',
  },
  {
    icon: 'calendar-outline',
    title: 'Calendar',
    subtitle: 'Coming soon',
    accent: teal[300],
    type: 'coming-soon',
  },
  {
    icon: 'location-outline',
    title: 'Location',
    subtitle: 'Coming soon',
    accent: teal[400],
    type: 'coming-soon',
  },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { surface, text: t } = useThemeColors();
  const reduced = useReducedMotion();
  const [notificationsGranted, setNotificationsGranted] = useState(false);

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    safeArea: [styles.safeAreaFlex, { backgroundColor: surface.bg }],
    speechBubble: [styles.speechBubble, { backgroundColor: surface.cardAlt, borderColor: surface.border }],
    speechText: { color: t.primary },
    permissionCard: (isGranted: boolean, isComingSoon: boolean) => [
      styles.permissionCard,
      {
        backgroundColor: surface.card,
        borderColor: isGranted ? 'rgba(50, 215, 75, 0.2)' : surface.border,
        opacity: isComingSoon ? 0.5 : 1,
      },
    ],
    permTitle: { color: t.primary },
    permSubtitle: { color: t.secondary },
    comingSoonBadge: [styles.comingSoonBadge, { backgroundColor: surface.cardAlt }],
    comingSoonText: { color: t.muted },
  };

  // Check existing notification permission on mount
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') {
        setNotificationsGranted(true);
      }
    });
  }, []);

  async function handleAllowNotifications() {
    if (Platform.OS === 'web') {
      setNotificationsGranted(true);
      return;
    }
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationsGranted(status === 'granted');
    } catch {
      // Permission request failed — leave as not granted
    }
  }

  return (
    <SafeAreaView style={themed.safeArea}>
      <ProgressBar step={4} />
      <View className="flex-1" style={{ paddingHorizontal: layout.screenPaddingH }}>
        {/* Pip speech bubble row */}
        <View className="flex-row items-center" style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <PipCard expression="question" size="mini" />
          <View style={themed.speechBubble}>
            <Text style={[styles.speechText, themed.speechText]}>
              I need a few permissions to help you out!
            </Text>
          </View>
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <SectionLabel text="PERMISSIONS" />
        </View>

        {/* Permission cards */}
        <View style={styles.cardList}>
          {PERMISSIONS.map((perm, i) => {
            const isGranted = perm.type === 'notifications' && notificationsGranted;
            const isComingSoon = perm.type === 'coming-soon';

            return (
              <MotiView
                key={i}
                {...maybeReduce(entrance(i, 100), reduced)}
              >
                <View style={themed.permissionCard(isGranted, isComingSoon)}>
                  <View
                    style={[
                      styles.iconCircle,
                      { backgroundColor: `${perm.accent}14` },
                    ]}
                  >
                    <Ionicons name={perm.icon} size={20} color={perm.accent} />
                  </View>
                  <View style={styles.permTextContainer}>
                    <Text style={[styles.permTitle, themed.permTitle]}>
                      {perm.title}
                    </Text>
                    <Text style={[styles.permSubtitle, themed.permSubtitle]}>
                      {perm.subtitle}
                    </Text>
                  </View>
                  {isComingSoon ? (
                    <View style={themed.comingSoonBadge}>
                      <Text style={[styles.comingSoonText, themed.comingSoonText]}>
                        Soon
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleAllowNotifications}
                      disabled={isGranted}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={({ pressed }) => [
                        ...chipPressStyle({ pressed }),
                        webInteractive(),
                        styles.permActionButton,
                      ]}
                    >
                      {isGranted
                        ? (
                            <MotiView
                              {...maybeReduce({
                                from: { scale: 0.6 },
                                animate: { scale: 1 },
                                transition: springs.bouncy,
                              }, reduced)}
                              style={styles.grantedBadge}
                            >
                              <Text style={styles.badgeText}>
                                Done
                              </Text>
                            </MotiView>
                          )
                        : (
                            <View style={styles.allowBadge}>
                              <Text style={styles.badgeText}>
                                Allow
                              </Text>
                            </View>
                          )}
                    </Pressable>
                  )}
                </View>
              </MotiView>
            );
          })}
        </View>
      </View>

      <View style={{ paddingHorizontal: layout.screenPaddingH, paddingBottom: layout.screenPaddingBottom }}>
        <GradientButton
          title="Continue"
          onPress={() => router.push('/onboarding/phone')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- Extracted from themed object ---
  safeAreaFlex: {
    flex: 1,
  },
  speechBubble: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  permissionCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  comingSoonBadge: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  // --- Original static styles ---
  speechText: {
    fontSize: fontScale(13),
    fontFamily: 'Inter_500Medium',
  },
  cardList: {
    gap: layout.itemGap,
    marginTop: spacing.lg,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTextContainer: {
    flex: 1,
    gap: spacing.xxs,
  },
  permTitle: {
    fontSize: fontScale(14),
    fontFamily: 'Inter_600SemiBold',
  },
  permSubtitle: {
    fontSize: fontScale(12),
    fontFamily: 'Inter_400Regular',
  },
  comingSoonText: {
    fontSize: fontScale(10),
    fontFamily: 'Inter_500Medium',
  },
  permActionButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  grantedBadge: {
    backgroundColor: semantic.success,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  allowBadge: {
    backgroundColor: purple[500],
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    color: base.white,
    fontSize: fontScale(11),
    fontFamily: 'Inter_600SemiBold',
  },
});
