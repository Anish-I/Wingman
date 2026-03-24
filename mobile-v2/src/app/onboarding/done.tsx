import React from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';
import { blue, semantic, teal, useThemeColors } from '@/components/ui/tokens';
import { useIsFirstTime } from '@/lib/hooks/use-is-first-time';
import { popIn, entrance, useReducedMotion, maybeReduce } from '@/lib/motion';

const CONFETTI_COLORS = [semantic.info, semantic.success, '#9B7EC8', '#F5A623', teal[300], blue[500]];

const SCREEN_WIDTH = Dimensions.get('window').width;

type ConfettiPiece = {
  color: string;
  width: number;
  height: number;
  borderRadius: number;
  top: number;
  leftPct: number;
  rotate: string;
};

const CONFETTI_PIECES: ConfettiPiece[] = [
  { color: CONFETTI_COLORS[0], width: 16, height: 4, borderRadius: 2, top: 8, leftPct: 5, rotate: '25deg' },
  { color: CONFETTI_COLORS[1], width: 14, height: 4, borderRadius: 2, top: 20, leftPct: 18, rotate: '-40deg' },
  { color: CONFETTI_COLORS[2], width: 8, height: 8, borderRadius: 4, top: 4, leftPct: 30, rotate: '0deg' },
  { color: CONFETTI_COLORS[3], width: 12, height: 4, borderRadius: 2, top: 35, leftPct: 40, rotate: '60deg' },
  { color: CONFETTI_COLORS[4], width: 10, height: 4, borderRadius: 2, top: 12, leftPct: 52, rotate: '-15deg' },
  { color: CONFETTI_COLORS[5], width: 6, height: 6, borderRadius: 3, top: 28, leftPct: 62, rotate: '0deg' },
  { color: CONFETTI_COLORS[0], width: 14, height: 4, borderRadius: 2, top: 6, leftPct: 72, rotate: '45deg' },
  { color: CONFETTI_COLORS[1], width: 10, height: 10, borderRadius: 5, top: 40, leftPct: 82, rotate: '0deg' },
  { color: CONFETTI_COLORS[2], width: 16, height: 4, borderRadius: 2, top: 18, leftPct: 90, rotate: '-30deg' },
  { color: CONFETTI_COLORS[3], width: 10, height: 4, borderRadius: 2, top: 50, leftPct: 10, rotate: '70deg' },
  { color: CONFETTI_COLORS[4], width: 6, height: 6, borderRadius: 3, top: 55, leftPct: 48, rotate: '0deg' },
  { color: CONFETTI_COLORS[5], width: 12, height: 4, borderRadius: 2, top: 60, leftPct: 75, rotate: '-55deg' },
];

// No hardcoded chips — user hasn't connected any apps yet during onboarding

export default function DoneScreen() {
  const { surface, text: t } = useThemeColors();
  const router = useRouter();
  const [_, setIsFirstTime] = useIsFirstTime();
  const reduced = useReducedMotion();

  // Theme-dependent overrides (static layout in StyleSheet below)
  const themed = {
    safeArea: { backgroundColor: surface.bg },
    hintBanner: [styles.hintBanner, { backgroundColor: surface.section, borderColor: surface.border }],
    hintText: [styles.hintText, { color: t.muted }],
    title: { color: t.primary },
    subtitle: { color: t.muted },
  };

  function handleStart() {
    setIsFirstTime(false);
    router.replace('/(app)/chat');
  }

  return (
    <SafeAreaView className="flex-1 items-center" style={themed.safeArea}>
      <ProgressBar step={7} variant="green" />

      {/* Confetti layer */}
      {!reduced && (
        <View className="absolute w-full" style={styles.confettiLayer}>
          {CONFETTI_PIECES.map((piece, i) => (
            <MotiView
              key={i}
              from={{ translateY: 0, rotate: piece.rotate, opacity: 0.5 }}
              animate={{
                translateY: [0, 8 + (i % 4) * 3, 0],
                rotate: piece.rotate,
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                type: 'timing',
                duration: 1800 + i * 150,
                loop: true,
                repeatReverse: true,
              }}
              style={{
                position: 'absolute',
                width: piece.width,
                height: piece.height,
                borderRadius: piece.borderRadius,
                backgroundColor: piece.color,
                top: piece.top,
                left: (piece.leftPct / 100) * SCREEN_WIDTH,
              }}
            />
          ))}
        </View>
      )}

      {/* Content */}
      <View className="flex-1 items-center justify-center px-6" style={styles.contentGap}>
        {/* Pip */}
        <MotiView {...maybeReduce(popIn(0, 200), reduced)}>
          <PipCard expression="clap" size="large" className="" />
        </MotiView>

        {/* Header */}
        <MotiView {...maybeReduce(entrance(0, 400), reduced)} className="items-center" style={styles.headerGap}>
          {/* Section label with lines on both sides */}
          <View className="flex-row items-center" style={styles.completeLabelRow}>
            <View style={styles.completeLine} />
            <Text style={styles.completeLabel}>
              COMPLETE
            </Text>
            <View style={styles.completeLine} />
          </View>

          <Text style={[styles.title, themed.title]}>
            You're all set!
          </Text>
          <Text style={[styles.subtitle, themed.subtitle]}>
            {'Just text me anytime.\nWelcome to the flock!'}
          </Text>
        </MotiView>

        {/* Hint to connect apps */}
        <MotiView {...maybeReduce(popIn(0, 600), reduced)}>
          <View
            className="flex-row items-center rounded-lg px-4"
            style={themed.hintBanner}
          >
            <Ionicons name="apps-outline" size={14} color={semantic.info} />
            <Text style={themed.hintText}>
              Connect your apps from the Apps tab
            </Text>
          </View>
        </MotiView>
      </View>

      {/* Bottom button */}
      <View className="w-full px-6 pb-8">
        <GradientButton
          title="Start Texting Pip"
          variant="success"
          showArrow
          icon="chatbubble-ellipses"
          onPress={handleStart}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // --- Extracted from themed object ---
  hintBanner: {
    height: 38,
    borderWidth: 1,
    gap: 8,
  },
  hintText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  // --- Original static styles ---
  confettiLayer: {
    height: 80,
    zIndex: 10,
  },
  contentGap: {
    gap: 24,
  },
  headerGap: {
    gap: 12,
  },
  completeLabelRow: {
    gap: 12,
  },
  completeLine: {
    width: 24,
    height: 2,
    backgroundColor: semantic.success,
    borderRadius: 1,
  },
  completeLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 2,
    color: semantic.success,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 32,
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
});
