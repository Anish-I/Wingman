import React from 'react';
import { View, Text } from 'react-native';

interface SectionLabelProps {
  text: string;
  color?: string;
}

export default function SectionLabel({ text, color = '#4A7BD9' }: SectionLabelProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 24, height: 2, backgroundColor: color, borderRadius: 1 }} />
      <Text
        style={{
          fontFamily: 'Inter_700Bold',
          fontSize: 11,
          letterSpacing: 2,
          color,
          textTransform: 'uppercase',
        }}
      >
        {text}
      </Text>
    </View>
  );
}
