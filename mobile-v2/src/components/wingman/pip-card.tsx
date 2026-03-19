import type { ImageSourcePropType } from 'react-native';
import type { PipExpression } from '@/types';
import { MotiView } from 'moti';
import * as React from 'react';
import { Image, View } from 'react-native';
import { purple, surface } from '@/components/ui/tokens';

const pipImages: Record<string, ImageSourcePropType> = {
  // Sheet 1 (4x3)
  'lurk': require('../../../assets/pip/pip-lurk.png'),
  'gg': require('../../../assets/pip/pip-gg.png'),
  'thumbsup': require('../../../assets/pip/pip-thumbsup.png'),
  'angry': require('../../../assets/pip/pip-angry.png'),
  'no': require('../../../assets/pip/pip-no.png'),
  'love': require('../../../assets/pip/pip-love.png'),
  'coding-angry': require('../../../assets/pip/pip-coding-angry.png'),
  'cool': require('../../../assets/pip/pip-cool.png'),
  'fail': require('../../../assets/pip/pip-fail.png'),
  'coding': require('../../../assets/pip/pip-coding.png'),
  'dab': require('../../../assets/pip/pip-dab.png'),
  'vpn': require('../../../assets/pip/pip-vpn.png'),
  // Sheet 2 (5x4)
  'wave': require('../../../assets/pip/pip-wave.png'),
  'thinking': require('../../../assets/pip/pip-thinking.png'),
  'headband': require('../../../assets/pip/pip-headband.png'),
  'question': require('../../../assets/pip/pip-question.png'),
  '404': require('../../../assets/pip/pip-404.png'),
  'hypnotized': require('../../../assets/pip/pip-hypnotized.png'),
  'sad-coding': require('../../../assets/pip/pip-sad-coding.png'),
  'checkmark': require('../../../assets/pip/pip-checkmark.png'),
  'excited': require('../../../assets/pip/pip-excited.png'),
  'surprised': require('../../../assets/pip/pip-surprised.png'),
  'alert': require('../../../assets/pip/pip-alert.png'),
  'calendar': require('../../../assets/pip/pip-calendar.png'),
  'ninja': require('../../../assets/pip/pip-ninja.png'),
  'bonk': require('../../../assets/pip/pip-bonk.png'),
  'business': require('../../../assets/pip/pip-business.png'),
  'overwhelmed': require('../../../assets/pip/pip-overwhelmed.png'),
  'coffee': require('../../../assets/pip/pip-coffee.png'),
  'clap': require('../../../assets/pip/pip-clap.png'),
  'crying': require('../../../assets/pip/pip-crying.png'),
  'eating': require('../../../assets/pip/pip-eating.png'),
  // Aliases
  'happy': require('../../../assets/pip/pip-thumbsup.png'),
  'logo': require('../../../assets/pip/pip-wave.png'),
};

type PipCardProps = {
  /** @deprecated Speech bubble removed — screens handle their own text now. Kept for compat. */
  message?: string;
  expression?: PipExpression;
  size?: 'large' | 'medium' | 'small' | 'tiny' | 'mini';
  className?: string;
};

const sizeMap: Record<NonNullable<PipCardProps['size']>, number> = {
  large: 180,
  medium: 120,
  small: 72,
  tiny: 64,
  mini: 56,
};

export default function PipCard({ expression = 'happy', size = 'large', className, message: _message }: PipCardProps) {
  const imageSize = sizeMap[size];
  const scaledSize = Math.round(imageSize * 1.25);
  const showBorder = size === 'large' || size === 'medium';

  const shouldBreathe = size === 'large' || size === 'medium';

  return (
    <View className={`items-center ${className ?? ''}`}>
      <MotiView
        animate={{ scale: shouldBreathe ? 1.02 : 1 }}
        from={{ scale: 1 }}
        transition={
          shouldBreathe
            ? { type: 'timing', duration: 2600, loop: true, repeatReverse: true }
            : undefined
        }
      >
        <View
          style={{
            width: imageSize,
            height: imageSize,
            borderRadius: imageSize / 2,
            backgroundColor: surface.section,
            borderWidth: showBorder ? 1.5 : 0,
            borderColor: showBorder ? purple[500] : 'transparent',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            // Premium glow for larger sizes
            ...(showBorder
              ? {
                shadowColor: purple[500],
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 8,
                elevation: 2,
              }
              : {}),
          }}
        >
          <Image
            source={pipImages[expression] || pipImages.happy}
            style={{ width: scaledSize, height: scaledSize, resizeMode: 'cover' }}
          />
        </View>
      </MotiView>
    </View>
  );
}
