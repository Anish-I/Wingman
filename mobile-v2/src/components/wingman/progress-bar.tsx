import { MotiView } from 'moti';
import * as React from 'react';
import { View } from 'react-native';
import { purple, semantic, surface } from '@/components/ui/tokens';

type ProgressBarProps = {
  step: number;
  total?: number;
  variant?: 'purple' | 'green';
};

export default function ProgressBar({ step, total = 7, variant = 'purple' }: ProgressBarProps) {
  const activeColor = variant === 'green' ? semantic.success : purple[500];

  return (
    <View className="flex-row gap-2 px-6 pt-3 pb-2">
      {Array.from({ length: total }, (_, i) => {
        const isActive = i < step;
        return (
          <MotiView
            key={i}
            className="flex-1"
            from={{ opacity: isActive ? 0.2 : 0.5, scaleX: isActive ? 0.4 : 1 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{
              type: 'spring' as const,
              damping: 16,
              stiffness: 150,
              delay: i * 30,
            }}
            style={{
              height: isActive ? 3.5 : 2,
              borderRadius: 2.5,
              backgroundColor: isActive ? activeColor : surface.border,
              // Subtle glow on active segments
              ...(isActive && variant === 'purple'
                ? {
                  shadowColor: purple[500],
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.3,
                  shadowRadius: 3,
                  elevation: 1,
                }
                : {}),
            }}
          />
        );
      })}
    </View>
  );
}
