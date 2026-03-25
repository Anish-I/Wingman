import { Link, Stack } from 'expo-router';

import { Text, View } from '@/components/ui';
import { spacing } from '@/components/ui/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center" style={{ padding: spacing.lg }}>
        <Text className="text-2xl font-bold" style={{ marginBottom: spacing.lg }}>
          This screen doesn&apos;t exist.
        </Text>

        <Link href="/" style={{ marginTop: spacing.lg }}>
          <Text className="text-blue-500 underline">Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}
