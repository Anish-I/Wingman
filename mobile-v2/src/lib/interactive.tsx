/**
 * Interactive Component Wrapper
 *
 * Provides consistent press, hover, and focus states across buttons, chips, and cards.
 * Reduces boilerplate for motion and web interaction styling.
 *
 * Usage:
 *   <Interactive variant="button" color="#7C5CFC">
 *     <Pressable onPress={...}>
 *       <Text>Click me</Text>
 *     </Pressable>
 *   </Interactive>
 */

import * as React from 'react';
import { Platform } from 'react-native';
import { webHoverStyle, webFocusRing } from './motion';

type InteractiveVariant = 'button' | 'chip' | 'card' | 'subtle';

interface InteractiveProps {
  children: React.ReactNode;
  /** press state from Pressable style callback */
  pressed?: boolean;
  /** hovered state from Pressable style callback */
  hovered?: boolean;
  /** focused state from Pressable style callback */
  focused?: boolean;
  disabled?: boolean;
  variant?: InteractiveVariant;
  color?: string;
  /** Opacity/scale during press */
  intensity?: 'subtle' | 'medium' | 'intense';
}

/**
 * Get press style (opacity + scale) based on variant and intensity
 */
export function getPressStyle(
  pressed: boolean,
  variant: InteractiveVariant = 'button',
  intensity: 'subtle' | 'medium' | 'intense' = 'medium',
) {
  if (!pressed) return { opacity: 1, transform: [{ scale: 1 }] };

  const pressConfigs = {
    button: { subtle: [0.9, 0.98], medium: [0.82, 0.96], intense: [0.75, 0.88] },
    chip: { subtle: [0.85, 0.96], medium: [0.75, 0.93], intense: [0.65, 0.88] },
    card: { subtle: [0.92, 0.99], medium: [0.85, 0.97], intense: [0.78, 0.94] },
    subtle: { subtle: [0.95, 0.99], medium: [0.9, 0.98], intense: [0.85, 0.96] },
  };

  const [opacity, scale] = pressConfigs[variant][intensity];
  return { opacity, transform: [{ scale }] };
}

/**
 * Get web-only interactive styles for Pressable state callback
 * Includes hover glow, focus ring, and cursor
 */
export function getWebInteractiveStyle(
  state: { pressed?: boolean; hovered?: boolean; focused?: boolean },
  options: {
    variant?: InteractiveVariant;
    color?: string;
    disabled?: boolean;
    hoverStrength?: 'soft' | 'medium' | 'strong';
  } = {},
) {
  if (!Platform.OS || Platform.OS !== 'web') return undefined;

  const {
    variant = 'button',
    color = '#7C5CFC',
    disabled = false,
    hoverStrength = 'medium',
  } = options;

  const { pressed = false, hovered = false, focused = false } = state;

  const styles: any = {
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease, box-shadow 120ms ease',
  };

  // Hover glow
  if (hovered && !pressed && !disabled) {
    const hoverGlow = webHoverStyle(true, color, hoverStrength);
    if (hoverGlow) Object.assign(styles, hoverGlow);

    // Subtle lift on hover for buttons
    if (variant === 'button' || variant === 'card') {
      styles.transform = [{ scale: 1.02 }];
    }
  }

  // Focus ring
  if (focused && !disabled) {
    const focusRing = webFocusRing(true, color);
    if (focusRing) Object.assign(styles, focusRing);
  }

  return styles;
}

/**
 * Combined hook for consistent interactive styles
 * Use in Pressable style callback
 */
export function useInteractiveStyle(
  state: { pressed?: boolean; hovered?: boolean; focused?: boolean },
  options: {
    variant?: InteractiveVariant;
    color?: string;
    disabled?: boolean;
    intensity?: 'subtle' | 'medium' | 'intense';
  } = {},
) {
  const {
    variant = 'button',
    color = '#7C5CFC',
    disabled = false,
    intensity = 'medium',
  } = options;

  const { pressed = false } = state;

  const pressStyle = getPressStyle(pressed, variant, intensity);
  const webStyle = getWebInteractiveStyle(state, { variant, color, disabled });

  return [pressStyle, webStyle];
}
