import type { DimensionValue } from 'react-native';
import { useWindowDimensions } from 'react-native';

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
