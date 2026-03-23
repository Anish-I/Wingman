/* eslint-disable better-tailwindcss/no-unknown-classes */
import type { PressableProps, View } from 'react-native';
import type { VariantProps } from 'tailwind-variants';
import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, Text } from 'react-native';
import { tv } from 'tailwind-variants';
import { pressStyle, webInteractive, webHoverStyle, webFocusRing } from '@/lib/motion';

const button = tv({
  slots: {
    container: 'flex flex-row items-center justify-center rounded-xl px-4',
    label: 'font-inter text-base font-semibold',
    indicator: 'h-6 text-white',
  },

  variants: {
    variant: {
      /** Primary action — bold, high-trust purple with shadow */
      primary: {
        container: 'bg-[#7C5CFC] dark:bg-[#7C5CFC]',
        label: 'text-white dark:text-white',
        indicator: 'text-white dark:text-white',
      },
      /** Secondary action — purple outline, clear affordance */
      secondary: {
        container: 'border border-[#7C5CFC] dark:border-[#7C5CFC] bg-transparent',
        label: 'text-[#7C5CFC] dark:text-[#A084FF]',
        indicator: 'text-[#7C5CFC] dark:text-[#A084FF]',
      },
      /** Assistant accent — teal for secondary actions */
      accent: {
        container: 'bg-[#6EC6B8] dark:bg-[#6EC6B8]',
        label: 'text-white dark:text-white',
        indicator: 'text-white dark:text-white',
      },
      /** Social/auth button — elevated outline */
      social: {
        container: 'border border-neutral-300 dark:border-[#35354A] bg-white dark:bg-[#131315]',
        label: 'text-neutral-900 dark:text-[#F0F0F5]',
        indicator: 'text-neutral-900 dark:text-[#F0F0F5]',
      },
      /** Outline variant — neutral, clear border */
      outline: {
        container: 'border border-neutral-400 dark:border-[#35354A]',
        label: 'text-black dark:text-neutral-100',
        indicator: 'text-black dark:text-neutral-100',
      },
      /** Destructive action — error state */
      destructive: {
        container: 'bg-danger-600',
        label: 'text-white',
        indicator: 'text-white',
      },
      /** Ghost — text only, no background */
      ghost: {
        container: 'bg-transparent',
        label: 'text-black underline dark:text-white',
        indicator: 'text-black dark:text-white',
      },
      /** Link — text action, minimal affordance */
      link: {
        container: 'bg-transparent',
        label: 'text-black dark:text-[#A084FF]',
        indicator: 'text-black dark:text-[#A084FF]',
      },
    },
    size: {
      default: {
        container: 'h-12 px-5 my-2',
        label: 'text-base',
      },
      lg: {
        container: 'h-14 px-8 my-3',
        label: 'text-lg',
      },
      sm: {
        container: 'h-9 px-3 my-1',
        label: 'text-sm',
        indicator: 'h-4',
      },
      icon: { container: 'size-10' },
    },
    disabled: {
      true: {
        container: 'bg-neutral-200 dark:bg-[#1F1F24]',
        label: 'text-neutral-400 dark:text-[#8E8E9D]',
        indicator: 'text-neutral-400 dark:text-[#8E8E9D]',
      },
    },
    fullWidth: {
      true: {
        container: 'w-full',
      },
      false: {
        container: 'self-center',
      },
    },
  },
  defaultVariants: {
    variant: 'primary',
    disabled: false,
    fullWidth: true,
    size: 'default',
  },
});

type ButtonVariants = VariantProps<typeof button>;
type Props = {
  label?: string;
  loading?: boolean;
  className?: string;
  textClassName?: string;
} & ButtonVariants & Omit<PressableProps, 'disabled'>;

export function Button({ ref, label: text, loading = false, variant = 'primary', disabled = false, size = 'default', className = '', testID, textClassName = '', ...props }: Props & { ref?: React.RefObject<View | null> }) {
  const styles = React.useMemo(
    () => button({ variant, disabled, size }),
    [variant, disabled, size],
  );

  // Map variant to glow color for web interactions
  const glowColor = variant === 'secondary' || variant === 'link'
    ? 'rgba(124, 92, 252, 0.4)'
    : variant === 'accent'
      ? 'rgba(110, 198, 184, 0.3)'
      : 'rgba(124, 92, 252, 0.3)';

  return (
    <Pressable
      disabled={disabled || loading}
      className={styles.container({ className })}
      {...props}
      ref={ref}
      testID={testID}
      style={({ pressed, focused, hovered }: any) => [
        ...pressStyle({ pressed }),
        webInteractive(disabled || loading),
        // Web focus ring — purple glow
        Platform.OS === 'web' && focused && !disabled
          ? { boxShadow: `0 0 0 2.5px ${glowColor}`, borderRadius: 12 } as any
          : undefined,
        // Web hover lift — amplified for primary
        Platform.OS === 'web' && hovered && !pressed && !disabled && variant === 'primary'
          ? { transform: [{ scale: 1.02 }], boxShadow: '0 6px 20px rgba(124, 92, 252, 0.25)' } as any
          : undefined,
        // Web hover for secondary variants
        Platform.OS === 'web' && hovered && !pressed && !disabled && (variant === 'secondary' || variant === 'link')
          ? { opacity: 0.9 } as any
          : undefined,
      ]}
    >
      {props.children
        ? (
            props.children
          )
        : (
            <>
              {loading
                ? (
                    <ActivityIndicator
                      size="small"
                      className={styles.indicator()}
                      testID={testID ? `${testID}-activity-indicator` : undefined}
                    />
                  )
                : (
                    <Text
                      testID={testID ? `${testID}-label` : undefined}
                      className={styles.label({ className: textClassName })}
                    >
                      {text}
                    </Text>
                  )}
            </>
          )}
    </Pressable>
  );
}
