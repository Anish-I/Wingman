import type { Theme } from '@react-navigation/native';
import {
  DarkTheme as _DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import { useUniwind } from 'uniwind';

import colors from '@/components/ui/colors';

/**
 * Dark theme for "Premium Assistant OS"
 * - Primary: Purple (brand, trust, action)
 * - Secondary: Teal (assistant status, confidence)
 * - Surfaces: Intentional depth hierarchy (bg → card → section → elevated)
 */
const DarkTheme: Theme = {
  ..._DarkTheme,
  colors: {
    ..._DarkTheme.colors,
    primary: colors.primary[500], // Purple — primary action
    background: colors.charcoal[950], // #0A0A0C
    text: '#F0F0F5', // Primary text
    border: '#232330', // Standard border
    card: '#131315', // Card surface
  },
};

const LightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary[500],
    background: colors.white,
  },
};

export function useThemeConfig() {
  const { theme } = useUniwind();

  if (theme === 'dark')
    return DarkTheme;

  return LightTheme;
}
