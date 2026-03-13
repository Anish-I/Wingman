import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import PipCard from '@/components/wingman/pip-card';
import ProgressBar from '@/components/wingman/progress-bar';
import GradientButton from '@/components/wingman/gradient-button';
import { useIsFirstTime } from '@/lib/hooks/use-is-first-time';

const CONFETTI_PIECES = [
  { color: '#4A7BD9', size: 8, top: '6%', left: '8%' },
  { color: '#6EC6B8', size: 6, top: '10%', left: '88%' },
  { color: '#9B7EC8', size: 10, top: '4%', left: '48%' },
  { color: '#F5A623', size: 7, top: '16%', left: '22%' },
  { color: '#34C759', size: 5, top: '13%', left: '72%' },
  { color: '#4A7BD9', size: 6, top: '20%', left: '92%' },
  { color: '#6EC6B8', size: 9, top: '2%', left: '33%' },
  { color: '#9B7EC8', size: 5, top: '18%', left: '62%' },
  { color: '#F5A623', size: 8, top: '8%', left: '4%' },
  { color: '#34C759', size: 6, top: '5%', left: '78%' },
  { color: '#4A7BD9', size: 7, top: '23%', left: '42%' },
  { color: '#6EC6B8', size: 5, top: '1%', left: '18%' },
  { color: '#9B7EC8', size: 6, top: '15%', left: '55%' },
  { color: '#F5A623', size: 4, top: '9%', left: '38%' },
  { color: '#34C759', size: 7, top: '21%', left: '85%' },
];

const CONNECTED_APPS = [
  { name: 'Gmail', color: '#4A7BD9' },
  { name: 'Calendar', color: '#6EC6B8' },
  { name: 'Slack', color: '#9B7EC8' },
];

export default function DoneScreen() {
  const router = useRouter();
  const [_, setIsFirstTime] = useIsFirstTime();

  function handleStart() {
    setIsFirstTime(false);
    router.replace('/(app)');
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Confetti */}
      {CONFETTI_PIECES.map((piece, i) => (
        <MotiView
          key={i}
          from={{ translateY: 0, opacity: 0.4 }}
          animate={{ translateY: 12 + piece.size, opacity: 0.8 }}
          transition={{
            type: 'timing',
            duration: 2000 + i * 200,
            loop: true,
            repeatReverse: true,
          }}
          style={{
            position: 'absolute',
            backgroundColor: piece.color,
            width: piece.size,
            height: piece.size,
            borderRadius: piece.size / 2,
            top: piece.top as any,
            left: piece.left as any,
            zIndex: 0,
          }}
        />
      ))}

      <ProgressBar step={7} />
      <View className="flex-1 px-6 items-center">
        <View className="flex-1" />
        <PipCard
          expression="excited"
          message="You're all set! Just text me anytime. Welcome to the flock!"
          size="large"
        />
        <View className="flex-row flex-wrap justify-center gap-2 mt-6">
          {CONNECTED_APPS.map((app) => (
            <View key={app.name} className="flex-row items-center bg-card rounded-full px-3.5 py-2 gap-2">
              <View className="w-2 h-2 rounded-full" style={{ backgroundColor: app.color }} />
              <Text className="text-foreground text-[13px] font-medium">{app.name}</Text>
              <Ionicons name="checkmark" size={14} color="#34C759" />
            </View>
          ))}
        </View>
        <View className="flex-1" />
      </View>
      <View className="px-6 pb-8">
        <GradientButton title="Start Texting Pip" onPress={handleStart} variant="success" />
      </View>
    </SafeAreaView>
  );
}
