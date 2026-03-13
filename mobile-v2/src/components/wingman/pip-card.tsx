import React from 'react';
import { View, Text, Image, type ImageSourcePropType } from 'react-native';
import { MotiView } from 'moti';
import type { PipExpression } from '@/types';

const pipImages: Record<string, ImageSourcePropType> = {
  happy: require('../../../assets/pip/pip-happy.png'),
  thinking: require('../../../assets/pip/pip-thinking.png'),
  excited: require('../../../assets/pip/pip-excited.png'),
  wave: require('../../../assets/pip/pip-wave.png'),
  thumbsup: require('../../../assets/pip/pip-happy.png'),
  coding: require('../../../assets/pip/pip-thinking.png'),
  checkmark: require('../../../assets/pip/pip-happy.png'),
  cool: require('../../../assets/pip/pip-excited.png'),
  love: require('../../../assets/pip/pip-wave.png'),
  no: require('../../../assets/pip/pip-thinking.png'),
  fail: require('../../../assets/pip/pip-thinking.png'),
  crying: require('../../../assets/pip/pip-thinking.png'),
  coffee: require('../../../assets/pip/pip-thinking.png'),
  clap: require('../../../assets/pip/pip-excited.png'),
  angry: require('../../../assets/pip/pip-thinking.png'),
  business: require('../../../assets/pip/pip-happy.png'),
  logo: require('../../../assets/pip/pip-wave.png'),
};

interface PipCardProps {
  message?: string;
  expression?: PipExpression;
  size?: 'large' | 'medium' | 'small';
  className?: string;
}

export default function PipCard({ message, expression = 'happy', size = 'large', className }: PipCardProps) {
  const imageSize = size === 'large' ? 160 : size === 'medium' ? 100 : 80;

  return (
    <View className={`items-center py-4 ${className ?? ''}`}>
      <Image
        source={pipImages[expression] || pipImages.happy}
        style={{ width: imageSize, height: imageSize, marginBottom: 16 }}
        resizeMode="contain"
      />
      {message ? (
        <MotiView
          from={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="relative bg-white rounded-2xl px-[22px] py-4 mx-6 shadow-md"
        >
          <View
            className="absolute -top-[7px] self-center left-1/2 -ml-[7px] w-[14px] h-[14px] bg-white rotate-45"
          />
          <Text className="text-[#1A1B2E] text-base leading-6 text-center font-medium">
            {message}
          </Text>
        </MotiView>
      ) : null}
    </View>
  );
}
