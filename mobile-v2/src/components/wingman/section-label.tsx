import * as React from 'react';
import { Text, View } from 'react-native';
import { purple, text as t } from '@/components/ui/tokens';

type SectionLabelProps = {
  text: string;
  color?: string;
};

export default function SectionLabel({ text, color = purple[500] }: SectionLabelProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View
        style={{
          width: 24,
          height: 2.5,
          backgroundColor: color,
          borderRadius: 2,
          opacity: 0.85,
        }}
      />
      <Text
        style={{
          fontFamily: 'Inter_600SemiBold',
          fontSize: 11,
          letterSpacing: 1.6,
          color: t.muted,
          textTransform: 'uppercase',
        }}
      >
        {text}
      </Text>
    </View>
  );
}
