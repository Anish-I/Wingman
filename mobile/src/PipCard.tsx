import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ImageSourcePropType,
} from 'react-native';
import { colors, radius, spacing, shadows } from './theme';

type PipExpression =
  | 'happy' | 'thinking' | 'excited' | 'wave'
  | 'thumbsup' | 'coding' | 'checkmark' | 'cool'
  | 'love' | 'no' | 'fail' | 'crying'
  | 'coffee' | 'clap' | 'angry' | 'business' | 'logo';

interface PipCardProps {
  message?: string;
  expression?: PipExpression;
  style?: object;
  size?: 'large' | 'small';
}

const pipImages: Record<string, ImageSourcePropType> = {
  happy: require('../assets/pip/pip-happy.png'),
  thinking: require('../assets/pip/pip-thinking.png'),
  excited: require('../assets/pip/pip-excited.png'),
  wave: require('../assets/pip/pip-wave.png'),
  thumbsup: require('../assets/pip/pip-happy.png'),
  coding: require('../assets/pip/pip-thinking.png'),
  checkmark: require('../assets/pip/pip-happy.png'),
  cool: require('../assets/pip/pip-excited.png'),
  love: require('../assets/pip/pip-wave.png'),
  no: require('../assets/pip/pip-thinking.png'),
  fail: require('../assets/pip/pip-thinking.png'),
  crying: require('../assets/pip/pip-thinking.png'),
  coffee: require('../assets/pip/pip-thinking.png'),
  clap: require('../assets/pip/pip-excited.png'),
  angry: require('../assets/pip/pip-thinking.png'),
  business: require('../assets/pip/pip-happy.png'),
  logo: require('../assets/pip/pip-wave.png'),
};

export default function PipCard({ message, expression = 'happy', style, size = 'large' }: PipCardProps) {
  const imageSize = size === 'large' ? 140 : 64;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.avatarRing}>
        <View style={styles.avatarInner}>
          <Image
            source={pipImages[expression] || pipImages.happy}
            style={[styles.pip, { width: imageSize, height: imageSize }]}
            resizeMode="contain"
          />
        </View>
      </View>
      {message ? (
        <View style={styles.bubble}>
          <View style={styles.bubblePointer} />
          <Text style={styles.text}>{message}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  avatarRing: {
    padding: 3,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.accentMuted,
    marginBottom: spacing.md,
  },
  avatarInner: {
    borderRadius: radius.full,
    overflow: 'hidden',
    backgroundColor: colors.cardElevated,
  },
  pip: {
    // Size set dynamically
  },
  bubble: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: 22,
    paddingVertical: 16,
    marginHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    position: 'relative',
    ...shadows.md,
  },
  bubblePointer: {
    position: 'absolute',
    top: -7,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -7,
    width: 14,
    height: 14,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: colors.borderLight,
    transform: [{ rotate: '45deg' }],
  },
  text: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
});
