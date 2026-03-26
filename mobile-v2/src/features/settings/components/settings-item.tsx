import type { TxKeyPath } from '@/lib/i18n';

import * as React from 'react';
import { Pressable, Text, View } from '@/components/ui';
import { ArrowRight } from '@/components/ui/icons';
import { spacing } from '@/components/ui/tokens';
import { cardPressStyle } from '@/lib/motion';

type ItemProps = {
  text: TxKeyPath;
  value?: string;
  onPress?: () => void;
  icon?: React.ReactNode;
};

export function SettingsItem({ text, value, icon, onPress }: ItemProps) {
  const isPressable = onPress !== undefined;
  return (
    <Pressable
      accessibilityRole={isPressable ? 'button' : undefined}
      accessibilityLabel={typeof text === 'string' ? (value ? `${text}, ${value}` : text) : (value || undefined)}
      accessibilityHint={isPressable ? 'Double tap to open' : undefined}
      onPress={onPress}
      pointerEvents={isPressable ? 'auto' : 'none'}
      className="flex-1 flex-row items-center justify-between"
      style={isPressable
        ? ({ pressed }: { pressed: boolean }) => [
            { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
            ...cardPressStyle({ pressed }),
          ]
        : { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }
      }
    >
      <View className="flex-row items-center">
        {icon && <View style={{ paddingRight: spacing.sm }}>{icon}</View>}
        <Text tx={text} />
      </View>
      <View className="flex-row items-center">
        <Text className="text-neutral-600 dark:text-white">{value}</Text>
        {isPressable && (
          <View style={{ paddingLeft: spacing.sm }}>
            <ArrowRight />
          </View>
        )}
      </View>
    </Pressable>
  );
}
