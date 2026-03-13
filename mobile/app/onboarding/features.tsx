import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius } from '../../src/theme';

const FEATURES = [
  {
    icon: 'chatbubble-ellipses-outline' as const,
    title: 'Text-Based Control',
    description: 'Just text me what you need \u2014 I handle the rest.',
  },
  {
    icon: 'apps-outline' as const,
    title: '250+ App Integrations',
    description: 'Gmail, Slack, Calendar, GitHub, Notion, and more.',
  },
  {
    icon: 'git-branch-outline' as const,
    title: 'Smart Workflows',
    description: 'Automate recurring tasks with intelligent agents.',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Private & Secure',
    description: 'Your data stays yours. No sharing, ever.',
  },
];

export default function FeaturesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={2} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <PipCard
          expression="thumbsup"
          message="Here's what I can do for you"
          size="small"
        />
        <View style={styles.features}>
          {FEATURES.map((feat, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={styles.iconCircle}>
                <Ionicons name={feat.icon} size={24} color={colors.accent} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feat.title}</Text>
                <Text style={styles.featureDesc}>{feat.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <GradientButton
          title="Continue"
          onPress={() => router.push('/onboarding/signup')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  features: { gap: 12, marginTop: spacing.md },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  featureText: { flex: 1 },
  featureTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  featureDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
