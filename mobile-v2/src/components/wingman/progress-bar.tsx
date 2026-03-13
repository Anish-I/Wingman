import React from 'react';
import { View } from 'react-native';

interface ProgressBarProps {
  step: number;
  total?: number;
}

export default function ProgressBar({ step, total = 7 }: ProgressBarProps) {
  return (
    <View className="flex-row gap-1.5 px-6 pt-4 pb-2">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={`flex-1 h-[3px] rounded-full ${
            i < step ? 'bg-[#4A7BD9]' : 'bg-border'
          }`}
        />
      ))}
    </View>
  );
}
