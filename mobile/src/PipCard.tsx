import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ImageSourcePropType,
} from 'react-native';
import { colors, radius, spacing } from './theme';

type PipExpression =
  | 'happy' | 'thinking' | 'excited' | 'wave'
  | 'thumbsup' | 'coding' | 'checkmark' | 'cool'
  | 'love' | 'no' | 'fail' | 'crying'
  | 'coffee' | 'clap' | 'angry' | 'business' | 'logo';

interface PipCardProps {
  message: string;
  expression?: PipExpression;
  style?: object;
  size?: 'large' | 'small';
}

// Map expressions to available assets (4 base images, extras map to closest match)
const pipImages: Record<string, ImageSourcePropType> = {
  happy: require('../assets/pip/pip-happy.png'),
  thinking: require('../assets/pip/pip-thinking.png'),
  excited: require('../assets/pip/pip-excited.png'),
  wave: require('../assets/pip/pip-wave.png'),
  // Aliases mapping to existing assets until we have custom cropped emotes
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
  const imageSize = size === 'large' ? 180 : 80;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.imageContainer}>
        <Image
          source={pipImages[expression] || pipImages.happy}
          style={[styles.pip, { width: imageSize, height: imageSize }]}
          resizeMode="contain"
        />
      </View>
      <View style={styles.bubble}>
        <View style={styles.bubblePointer} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pip: {
    // Size set dynamically
  },
  bubble: {
    backgroundColor: colors.bubble,
    borderRadius: radius.lg,
    borderTopLeftRadius: 4,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  bubblePointer: {
    position: 'absolute',
    top: -8,
    left: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderLeftColor: 'transparent',
    borderRightWidth: 8,
    borderRightColor: 'transparent',
    borderBottomWidth: 8,
    borderBottomColor: colors.bubble,
  },
  text: {
    color: colors.bubbleText,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
});
