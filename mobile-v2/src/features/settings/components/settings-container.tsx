import type { TxKeyPath } from '@/lib/i18n';

import * as React from 'react';
import { Text, View } from '@/components/ui';
import { spacing } from '@/components/ui/tokens';

type Props = {
  children: React.ReactNode;
  title?: TxKeyPath;
};

export function SettingsContainer({ children, title }: Props) {
  return (
    <>
      {title && <Text className="text-lg" style={{ paddingTop: spacing.lg, paddingBottom: spacing.sm }} tx={title} />}
      <View className="rounded-md border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800">
        {children}
      </View>
    </>
  );
}
