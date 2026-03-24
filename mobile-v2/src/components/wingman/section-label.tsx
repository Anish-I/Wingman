import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { purple, useThemeColors } from '@/components/ui/tokens';

type SectionLabelProps = {
  text: string;
  color?: string;
};

export default function SectionLabel({ text, color = purple[500] }: SectionLabelProps) {
  const { text: t } = useThemeColors();

  const accentBarStyle = {
    ...styles.accentBar,
    backgroundColor: color,
  };

  const labelStyle = {
    ...styles.label,
    color: t.muted,
  };

  return (
    <View style={styles.container}>
      <View style={accentBarStyle} />
      <Text style={labelStyle}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  accentBar: {
    width: 24,
    height: 2.5,
    borderRadius: 2,
    opacity: 0.85,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
});
