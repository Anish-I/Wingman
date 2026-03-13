// Wingman Design System — "Midnight Luxury"
// Layered dark surfaces, teal surgical accents, refined depth

export const colors = {
  // Surface hierarchy (darkest → lightest)
  background: '#0E0F1A',
  backgroundElevated: '#141526',
  card: '#1C1D32',
  cardHover: '#22233D',
  cardElevated: '#262748',
  inputBg: '#1A1B30',

  // Borders & dividers
  border: '#2A2B46',
  borderLight: '#33345A',
  borderSubtle: '#1F2038',

  // Brand
  primary: '#4A6FE5',
  primaryLight: '#5B80F0',
  primaryDark: '#3555B8',
  primaryMuted: 'rgba(74, 111, 229, 0.15)',

  // Accent — teal highlight, used sparingly
  accent: '#3DDBC4',
  accentDark: '#2BB5A0',
  accentMuted: 'rgba(61, 219, 196, 0.12)',
  accentGlow: 'rgba(61, 219, 196, 0.25)',

  // Text
  text: '#F0F1F7',
  textSecondary: '#9BA1B7',
  textMuted: '#5D6279',
  textInverse: '#0E0F1A',

  // Chat bubbles
  bubble: '#FFFFFF',
  bubbleText: '#1A1B2E',
  bubbleShadow: 'rgba(0, 0, 0, 0.12)',
  bubbleUser: '#4A6FE5',
  bubbleUserText: '#FFFFFF',

  // Semantic
  success: '#34D399',
  successMuted: 'rgba(52, 211, 153, 0.12)',
  error: '#F87171',
  errorMuted: 'rgba(248, 113, 113, 0.12)',
  warning: '#FBBF24',
  warningMuted: 'rgba(251, 191, 36, 0.12)',
  info: '#60A5FA',

  // Overlay
  overlay: 'rgba(7, 8, 15, 0.75)',
  overlayLight: 'rgba(7, 8, 15, 0.5)',

  // Tab bar
  tabBar: '#111222',
  tabBarBorder: '#1A1B30',
};

export const gradients = {
  primary: ['#5B80F0', '#4A6FE5', '#3555B8'] as const,
  accent: ['#4EECD4', '#3DDBC4', '#2BB5A0'] as const,
  card: ['rgba(28, 29, 50, 0.9)', 'rgba(28, 29, 50, 0.6)'] as const,
  glow: ['rgba(61, 219, 196, 0.08)', 'rgba(61, 219, 196, 0)'] as const,
  surface: ['#1C1D32', '#171829'] as const,
};

export const fonts = {
  regular: 'NunitoSans_400Regular',
  semiBold: 'NunitoSans_600SemiBold',
  bold: 'NunitoSans_700Bold',
  extraBold: 'NunitoSans_800ExtraBold',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 36,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  }),
};
