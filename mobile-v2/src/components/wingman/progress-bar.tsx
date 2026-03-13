import React from 'react';
import { View } from 'react-native';

interface ProgressBarProps {
  step: number;
  total?: number;
  variant?: 'red' | 'green';
}

export default function ProgressBar({ step, total = 7, variant = 'red' }: ProgressBarProps) {
  const activeColor = variant === 'green' ? '#32D74B' : '#FF3B30';

  return (
    <View className="flex-row gap-1 px-6 pt-2 pb-1">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className="flex-1 h-1 rounded-sm"
          style={{ backgroundColor: i < step ? activeColor : '#242424' }}
        />
      ))}
    </View>
  );
}
