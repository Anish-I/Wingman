import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PipCard from '../../src/PipCard';
import ProgressBar from '../../src/components/ProgressBar';
import GradientButton from '../../src/components/GradientButton';
import { colors, spacing, radius, fonts } from '../../src/theme';

const FEATURES = [
  {
    icon: 'calendar-outline' as const,
    title: 'Schedule meetings',
    color: '#3B5998',
  },
  {
    icon: 'checkmark-circle-outline' as const,
    title: 'Manage tasks',
    color: '#34C759',
  },
  {
    icon: 'musical-notes-outline' as const,
    title: 'Control music',
    color: '#34C759',
  },
  {
    icon: 'mail-outline' as const,
    title: 'Send emails',
    color: '#F87171',
  },
  {
    icon: 'bulb-outline' as const,
    title: 'Smart reminders',
    color: '#F5A623',
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
          size="small"
        />
        <Text style={styles.headline}>Automate Everything</Text>
        <Text style={styles.subheadline}>through SMS</Text>
        <View style={styles.features}>
          {FEATURES.map((feat, i) => (
            <View key={i} style={styles.featureCard}>
              <View style={[styles.iconCircle, { backgroundColor: feat.color }]}>
                <Ionicons name={feat.icon} size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.featureTitle}>{feat.title}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <GradientButton
          title="Let us Go"
          onPress={() => router.push('/onboarding/signup')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  headline: {
    color: colors.text,
    fontSize: 28,
    fontFamily: fonts.extraBold,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  subheadline: {
    color: colors.teal,
    fontSize: 20,
    fontFamily: fonts.bold,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  features: { gap: 12 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  featureTitle: { color: colors.text, fontSize: 16, fontFamily: fonts.bold },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
