import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import SectionLabel from '@/components/wingman/section-label';
import { useIsFirstTime } from '@/lib/hooks/use-is-first-time';
import { signIn } from '@/features/auth/use-auth-store';

const CONFETTI_COLORS = ['#4A7BD9', '#32D74B', '#9B7EC8', '#F5A623', '#6EC6B8', '#3B5998'];

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

const CONNECTED_CHIPS = [
  { icon: 'calendar' as const, label: 'Calendar' },
  { icon: 'mail' as const, label: 'Gmail' },
  { icon: 'logo-slack' as const, label: 'Slack' },
];

export default function DoneScreen() {
  const router = useRouter();
  const [_, setIsFirstTime] = useIsFirstTime();

  function handleStart() {
    signIn('demo-mock-token');
    setIsFirstTime(false);
    router.replace('/(app)/chat');
  }

  return (
    <SafeAreaView className="flex-1 items-center" style={{ backgroundColor: '#0C0C0C' }}>
      <ProgressBar step={7} variant="green" />

      {/* Confetti layer */}
      <View className="absolute w-full" style={{ height: 80, zIndex: 10 }}>
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

      {/* Content */}
      <View className="flex-1 items-center justify-center px-6" style={{ gap: 24 }}>
        {/* Pip */}
        <PipCard expression="clap" size="large" className="" />

        {/* Header */}
        <View className="items-center" style={{ gap: 12 }}>
          {/* Section label with lines on both sides */}
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <View style={{ width: 24, height: 2, backgroundColor: '#32D74B', borderRadius: 1 }} />
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 11,
                letterSpacing: 2,
                color: '#32D74B',
              }}
            >
              COMPLETE
            </Text>
            <View style={{ width: 24, height: 2, backgroundColor: '#32D74B', borderRadius: 1 }} />
          </View>

          <Text
            style={{
              fontFamily: 'Sora_700Bold',
              fontSize: 32,
              color: '#FFFFFF',
              letterSpacing: -1.5,
              textAlign: 'center',
            }}
          >
            You're all set!
          </Text>
          <Text
            style={{
              fontFamily: 'Inter_400Regular',
              fontSize: 15,
              color: '#8A8A8A',
              lineHeight: 21,
              textAlign: 'center',
            }}
          >
            {'Just text me anytime.\nWelcome to the flock!'}
          </Text>
        </View>

        {/* Connected app pills */}
        <View className="flex-row justify-center" style={{ gap: 8 }}>
          {CONNECTED_CHIPS.map((chip) => (
            <View
              key={chip.label}
              className="flex-row items-center rounded-md px-3"
              style={{
                height: 34,
                backgroundColor: '#1A1A1A',
                borderWidth: 1,
                borderColor: '#2A2A2A',
                gap: 6,
              }}
            >
              <Ionicons name={chip.icon} size={14} color="#4A7BD9" />
              <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#FFFFFF' }}>
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
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
