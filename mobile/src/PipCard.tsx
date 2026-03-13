import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ImageSourcePropType,
} from 'react-native';

interface PipCardProps {
  message: string;
  expression?: 'happy' | 'thinking' | 'excited' | 'wave';
  style?: object;
}

const pipImages: Record<string, ImageSourcePropType> = {
  happy: require('../assets/pip/pip-happy.png'),
  thinking: require('../assets/pip/pip-thinking.png'),
  excited: require('../assets/pip/pip-excited.png'),
  wave: require('../assets/pip/pip-wave.png'),
};

export default function PipCard({ message, expression = 'happy', style }: PipCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.pipContainer}>
        <Image
          source={pipImages[expression]}
          style={styles.pip}
          resizeMode="contain"
        />
      </View>
      <View style={styles.bubble}>
        <Text style={styles.text}>{message}</Text>
        <View style={styles.tail} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    gap: 12,
  },
  pipContainer: {
    width: 64,
    alignItems: 'center',
  },
  pip: {
    width: 64,
    height: 64,
  },
  bubble: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 14,
  },
  text: {
    color: '#e0e0ff',
    fontSize: 15,
    lineHeight: 22,
  },
  tail: {
    position: 'absolute',
    left: -8,
    top: 12,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderTopColor: 'transparent',
    borderRightWidth: 8,
    borderRightColor: '#1a1a2e',
    borderBottomWidth: 8,
    borderBottomColor: 'transparent',
  },
});
