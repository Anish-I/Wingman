import { useRouter } from 'expo-router';
import * as React from 'react';

import {
  Button,
  FocusAwareStatusBar,
  SafeAreaView,
  Text,
  View,
} from '@/components/ui';
import { spacing } from '@/components/ui/tokens';
import { useIsFirstTime } from '@/lib/hooks';
import { Cover } from './components/cover';

export function OnboardingScreen() {
  const [_, setIsFirstTime] = useIsFirstTime();
  const router = useRouter();
  return (
    <View className="flex h-full items-center justify-center">
      <FocusAwareStatusBar />
      <View className="w-full flex-1">
        <Cover />
      </View>
      <View className="justify-end">
        <Text className="text-center text-5xl font-bold" style={{ marginVertical: spacing.md }}>
          Obytes Starter
        </Text>
        <Text className="mb-2 text-center text-lg text-gray-600">
          The right way to build your mobile app
        </Text>

        <Text className="text-left text-lg" style={{ marginVertical: spacing.xs, paddingTop: spacing['2xl'] }}>
          🚀 Production-ready
          {' '}
        </Text>
        <Text className="text-left text-lg" style={{ marginVertical: spacing.xs }}>
          🥷 Developer experience + Productivity
        </Text>
        <Text className="text-left text-lg" style={{ marginVertical: spacing.xs }}>
          🧩 Minimal code and dependencies
        </Text>
        <Text className="text-left text-lg" style={{ marginVertical: spacing.xs }}>
          💪 well maintained third-party libraries
        </Text>
      </View>
      <SafeAreaView className="mt-6">
        <Button
          label="Let's Get Started "
          onPress={() => {
            setIsFirstTime(false);
            router.replace('/login');
          }}
        />
      </SafeAreaView>
    </View>
  );
}
