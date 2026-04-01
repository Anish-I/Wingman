import type { DimensionValue } from 'react-native';
import { Dimensions, PixelRatio, useWindowDimensions } from 'react-native';

// ── Responsive font scaling ──────────────────────────────────
const BASE_WIDTH = 375; // iPhone SE / 8 — the reference design width

/**
 * Scale a font size relative to screen width.
 *
 * Uses moderate scaling so text shrinks gently on narrow phones (< 375 px)
 * and grows proportionally on tablets/large screens.
 *
 * - Small phones (< 375): 40% of the ratio difference, floor at 88%
 * - Standard phones (375–767): 40% of the ratio difference
 * - Tablets (768+): 55% of the ratio difference, allows up to 150%
 *
 * This ensures text remains readable on very small phones without crowding,
 * and scales up noticeably on tablets so it doesn't appear disproportionately small.
 */
export function fontScale(size: number): number {
  const { width } = Dimensions.get('window');
  const scale = width / BASE_WIDTH;

  // Use a steeper scaling factor on tablets so text grows meaningfully
  const dampening = width >= 768 ? 0.55 : 0.4;
  const factor = 1 + (scale - 1) * dampening;

  // Wider clamp range: allow shrink to 88% on tiny phones, grow to 150% on large tablets
  const clamped = Math.max(0.88, Math.min(1.5, factor));
  return PixelRatio.roundToNearestPixel(size * clamped);
}

/**
 * Responsive sizing that adapts to screen width and orientation.
 * Returns computed dimensions for app cards, chat bubbles, icons, etc.
 */
export function useResponsive() {
  const { width } = useWindowDimensions();

  const isTablet = width >= 768;
  const isLargeTablet = width >= 1024;

  // App card width: scales with screen, clamped to reasonable range
  const appCardWidth = isLargeTablet ? 160 : isTablet ? 130 : Math.max(80, Math.round(width * 0.22));

  // App card icon container: proportional to card
  const appIconSize = isLargeTablet ? 64 : isTablet ? 56 : 52;
  const appLogoSize = isLargeTablet ? 40 : isTablet ? 36 : 32;

  // Chat bubble max width: wider on tablets
  const chatMaxWidth: DimensionValue = isLargeTablet ? '60%' : isTablet ? '68%' : '78%';

  // Standalone app-card component (emoji-based)
  const standaloneCardWidth = isLargeTablet ? 112 : isTablet ? 100 : 88;
  const standaloneIconSize = isLargeTablet ? 68 : isTablet ? 62 : 56;

  return {
    width,
    isTablet,
    isLargeTablet,
    appCardWidth,
    appIconSize,
    appLogoSize,
    chatMaxWidth,
    standaloneCardWidth,
    standaloneIconSize,
  };
}
