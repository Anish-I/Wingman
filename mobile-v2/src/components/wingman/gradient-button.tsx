import { MotiView } from 'moti';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { springs, delays, useReducedMotion, maybeReduce } from '@/lib/motion';

type GradientButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'success';
  icon?: string;
  showArrow?: boolean;
};

/**
 * Animated wrapper around UI Button for onboarding CTAs.
 * All button styling is delegated to `<Button variant="gradient" />`.
 */
export default function GradientButton({
  title,
  onPress,
  disabled,
  variant = 'primary',
  icon,
  showArrow,
}: GradientButtonProps) {
  const reduced = useReducedMotion();

  return (
    <MotiView
      className="w-full"
      {...maybeReduce({
        from: { opacity: 0, translateY: 12 },
        animate: { opacity: disabled ? 0.5 : 1, translateY: 0 },
        transition: { ...springs.snappy, delay: delays.fast },
      }, reduced)}
    >
      <Button
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: !!disabled }}
        variant={variant === 'success' ? 'gradientSuccess' : 'gradient'}
        size="lg"
        label={title}
        onPress={onPress}
        disabled={disabled}
        icon={icon}
        showArrow={showArrow}
      />
    </MotiView>
  );
}
