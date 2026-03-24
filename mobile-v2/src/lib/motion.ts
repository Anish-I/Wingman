/**
 * Wingman Motion System — reusable animation primitives
 *
 * Usage:
 *   import { springs, timing, stagger, entrance, press } from '@/lib/motion';
 *
 *   <MotiView {...entrance(i)} />
 *   <Pressable style={press.scale} />
 *
 * Design principles:
 * - Snappy (120ms) for press responses
 * - Gentle (300-400ms) for content entrances
 * - Bouncy for delightful pop-ins
 * - Micro (80ms) for rapid feedback (send button, toggles)
 */
import { AccessibilityInfo, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { purple } from '@/components/ui/tokens';

const isWeb = Platform.OS === 'web';

// ── Reduced motion support ───────────────────────────────────

/** Hook that returns true when the user has enabled reduced motion in OS settings. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Check initial value
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});

    // Listen for changes
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);

  return reduced;
}

/** Static no-animation props — use as a spread replacement for MotiView entrance props. */
const NO_ANIMATION = {
  from: undefined,
  animate: undefined,
  transition: undefined,
} as const;

/**
 * Returns simplified (instant) animation props when reduced motion is enabled.
 * Pass the result of an entrance/popIn/slideIn call and the reduced motion flag.
 *
 * Usage:
 *   const reduced = useReducedMotion();
 *   <MotiView {...maybeReduce(entrance(i), reduced)} />
 */
export function maybeReduce<T extends Record<string, any>>(
  animationProps: T,
  reducedMotion: boolean,
): T | typeof NO_ANIMATION {
  return reducedMotion ? NO_ANIMATION : animationProps;
}

// ── Spring presets ─────────────────────────────────────────────
export const springs = {
  /** Snappy button / chip response (120ms) */
  snappy: { type: 'spring' as const, damping: 18, stiffness: 200 },
  /** Default content entrance (350ms) */
  gentle: { type: 'spring' as const, damping: 15, stiffness: 120 },
  /** Bouncy pop-in for avatars, badges (280ms) */
  bouncy: { type: 'spring' as const, damping: 10, stiffness: 100 },
  /** Soft settle for modals, overlays (400ms) */
  soft: { type: 'spring' as const, damping: 20, stiffness: 80 },
  /** Micro-spring for quick feedback (toggle, send) — ultra-snappy (80ms) */
  micro: { type: 'spring' as const, damping: 22, stiffness: 280 },
  /** Extra bouncy for emphasis (FABs, important CTAs) */
  bouncier: { type: 'spring' as const, damping: 8, stiffness: 110 },
} as const;

// ── Timing presets ─────────────────────────────────────────────
export const timing = {
  fast: { type: 'timing' as const, duration: 200 },
  normal: { type: 'timing' as const, duration: 350 },
  slow: { type: 'timing' as const, duration: 500 },
} as const;

// ── Delay presets ─────────────────────────────────────────────
/** Named delay presets — use instead of arbitrary delay numbers */
export const delays = {
  /** No delay */
  none: 0,
  /** Quick follow-on (message avatars, secondary elements) */
  fast: 50,
  /** Standard section/content entrance */
  normal: 100,
  /** Slightly deferred elements (badges, counts, FABs) */
  slow: 200,
} as const;

// ── Stagger delay ──────────────────────────────────────────────
/** Standard stagger delay for list items */
export const STAGGER_MS = 60;

/** Max total stagger window — keeps entrance animations under 500ms */
const MAX_STAGGER_TOTAL_MS = 400;

/**
 * Compute stagger delay for index using an asymptotic curve.
 * Early items get noticeable spacing; later items compress smoothly
 * so total delay never exceeds MAX_STAGGER_TOTAL_MS regardless of list size.
 */
export function staggerDelay(index: number, baseDelay = 0) {
  // Asymptotic: delay = MAX * (1 - e^(-index * k))
  // k chosen so the first few items ≈ STAGGER_MS apart, then taper off.
  const k = STAGGER_MS / MAX_STAGGER_TOTAL_MS;
  const delay = MAX_STAGGER_TOTAL_MS * (1 - Math.exp(-index * k));
  return baseDelay + Math.round(delay);
}

// ── Entrance presets (MotiView props) ──────────────────────────

/** Fade-up entrance with stagger — the default list-item entrance */
export function entrance(index = 0, baseDelay = 0) {
  return {
    from: { opacity: 0, translateY: 16 },
    animate: { opacity: 1, translateY: 0 },
    transition: { ...springs.gentle, delay: staggerDelay(index, baseDelay) },
  } as const;
}

/** Scale-up pop entrance (avatars, badges, FABs) */
export function popIn(index = 0, baseDelay = 200) {
  return {
    from: { opacity: 0, scale: 0.7 },
    animate: { opacity: 1, scale: 1 },
    transition: { ...springs.bouncy, delay: staggerDelay(index, baseDelay) },
  } as const;
}

/** Slide-in from left (template rows, side content) */
export function slideIn(index = 0, baseDelay = 200) {
  return {
    from: { opacity: 0, translateX: -20 },
    animate: { opacity: 1, translateX: 0 },
    transition: { ...springs.gentle, delay: staggerDelay(index, baseDelay) },
  } as const;
}

/** Slide-in from right (secondary actions, trailing elements) */
export function slideInRight(index = 0, baseDelay = 200) {
  return {
    from: { opacity: 0, translateX: 20 },
    animate: { opacity: 1, translateX: 0 },
    transition: { ...springs.gentle, delay: staggerDelay(index, baseDelay) },
  } as const;
}

/** Header entrance (slight drop-down) */
export const headerEntrance = {
  from: { opacity: 0, translateY: -10 },
  animate: { opacity: 1, translateY: 0 },
  transition: springs.gentle,
} as const;

// ── Press interaction helpers ──────────────────────────────────

const WEB_PRESS_TRANSITION =
  'transform 120ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease, box-shadow 120ms ease';

/** Pressable style callback for scale + opacity response (primary buttons) */
export function pressStyle({ pressed }: { pressed: boolean }) {
  return [
    {
      opacity: pressed ? 0.82 : 1,
      transform: [{ scale: pressed ? 0.96 : 1 }],
    },
    isWeb
      ? ({ cursor: 'pointer', transition: WEB_PRESS_TRANSITION } as any)
      : undefined,
  ];
}

/** Lighter press for small chips / pills — minimal tactile feedback */
export function chipPressStyle({ pressed }: { pressed: boolean }) {
  return [
    {
      opacity: pressed ? 0.75 : 1,
      transform: [{ scale: pressed ? 0.93 : 1 }],
    },
    isWeb
      ? ({ cursor: 'pointer', transition: WEB_PRESS_TRANSITION } as any)
      : undefined,
  ];
}

/** Deeper press for cards and list rows — feels tangible and responsive */
export function cardPressStyle({ pressed }: { pressed: boolean }) {
  return [
    {
      opacity: pressed ? 0.85 : 1,
      transform: [{ scale: pressed ? 0.97 : 1 }],
    },
    isWeb
      ? ({
          cursor: 'pointer',
          transition: WEB_PRESS_TRANSITION,
        } as any)
      : undefined,
  ];
}

/** Intense press for action buttons (send, submit, confirm) */
export function actionPressStyle({ pressed }: { pressed: boolean }) {
  return [
    {
      opacity: pressed ? 0.75 : 1,
      transform: [{ scale: pressed ? 0.88 : 1 }],
    },
    isWeb
      ? ({
          cursor: 'pointer',
          transition: WEB_PRESS_TRANSITION,
        } as any)
      : undefined,
  ];
}

/** Web-only hover/focus styles for Pressable */
export function webInteractive(disabled?: boolean) {
  if (!isWeb) return undefined;
  return {
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: WEB_PRESS_TRANSITION,
  } as any;
}

/** Web-only hover styles with optional glow effect.
 *  Best applied in a style callback to detect hovered state. */
export function webHoverStyle(hovered: boolean, color: string = purple[500], strength: 'soft' | 'medium' | 'strong' = 'soft') {
  if (!isWeb || !hovered) return undefined;
  const opacities = { soft: '0.1', medium: '0.15', strong: '0.25' };
  return {
    boxShadow: `0 4px 16px ${color}${opacities[strength]}`,
    transition: 'box-shadow 200ms ease',
  } as any;
}

/** Web-only focus ring (keyboard navigation) */
export function webFocusRing(focused: boolean, color: string = purple[500]) {
  if (!isWeb || !focused) return undefined;
  return {
    boxShadow: `0 0 0 3px ${color}CC`,
    outline: 'none',
  } as any;
}

// ── Send button animation ──────────────────────────────────────

/** Animate config for send button (canSend toggles) — rapid visibility toggle */
export function sendButtonAnimate(canSend: boolean) {
  return {
    animate: {
      scale: canSend ? 1 : 0.7,
      opacity: canSend ? 1 : 0.2,
    },
    transition: springs.micro,
  };
}

/** Rapid pulse for send button when text is entered — draws attention */
export function sendButtonPulse() {
  return {
    from: { scale: 1 },
    animate: { scale: 1.08 },
    transition: {
      type: 'spring' as const,
      damping: 14,
      stiffness: 180,
    },
  } as const;
}

// ── Looping emphasis ───────────────────────────────────────────

/** Gentle pulse for elements that need ongoing attention (e.g. empty states) */
export function gentlePulse(delay = 0) {
  return {
    from: { scale: 1 },
    animate: { scale: 1.04 },
    transition: {
      type: 'timing' as const,
      duration: 2200,
      loop: true,
      repeatReverse: true,
      delay,
    },
  } as const;
}

/** Subtle float animation for avatars / illustrations */
export function gentleFloat(delay = 0) {
  return {
    from: { translateY: 0 },
    animate: { translateY: -8 },
    transition: {
      type: 'timing' as const,
      duration: 2800,
      loop: true,
      repeatReverse: true,
      delay,
    },
  } as const;
}

/** Shimmer glow for loading / awaiting state (used on empty states, CTAs) */
export function shimmerGlow(delay = 0) {
  return {
    from: { opacity: 0.6 },
    animate: { opacity: 1 },
    transition: {
      type: 'timing' as const,
      duration: 1800,
      loop: true,
      repeatReverse: true,
      delay,
    },
  } as const;
}
