import type { DimensionValue } from 'react-native';
import { Dimensions, PixelRatio, useWindowDimensions } from 'react-native';

// ── Responsive font scaling ──────────────────────────────────
const BASE_WIDTH = 375; // iPhone SE / 8 — the reference design width

/**
 * Scale a font size relative to screen width.
 *
 * Uses *moderate* scaling (40 % of the raw ratio difference) so text
 * shrinks gently on narrow phones (< 375 px) and grows gently on
 * tablets, instead of linearly tracking screen width.
 *
 * Clamped to 85 %–120 % of the base size to prevent extremes.
 */
export function fontScale(size: number): number {
  const { width } = Dimensions.get('window');
  const scale = width / BASE_WIDTH;
  // Apply only 40% of the scaling difference for a moderate effect
  const factor = 1 + (scale - 1) * 0.4;
  const clamped = Math.max(0.85, Math.min(1.2, factor));
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
