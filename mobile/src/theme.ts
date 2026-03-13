// Wingman Design System — "Pip"
// Layered dark surfaces, blue accents, refined depth

export const colors = {
  // Surface hierarchy (darkest → lightest)
  background: '#1A1B2E',
  backgroundElevated: '#242540',
  card: '#242540',
  cardHover: '#2E2F4D',
  cardElevated: '#2E2F4D',
  inputBg: '#242540',

  // Borders & dividers
  border: '#3A3B5C',
  borderLight: '#3A3B5C',
  borderSubtle: '#2E2F4D',

  // Brand
  primary: '#3B5998',
  primaryLight: '#4A7BD9',
  primaryDark: '#2D4474',
  primaryMuted: 'rgba(59, 89, 152, 0.15)',

  // Accent — teal highlight, used sparingly
  accent: '#6EC6B8',
  accentDark: '#5AAE9F',
  accentMuted: 'rgba(110, 198, 184, 0.12)',
  accentGlow: 'rgba(110, 198, 184, 0.25)',

  // Extended palette
  purple: '#9B7EC8',
  orange: '#F5A623',

  // Text
  text: '#FFFFFF',
  textSecondary: '#9A9BBF',
  textMuted: '#5D6279',
  textInverse: '#1A1B2E',

  // Chat bubbles
  bubble: '#FFFFFF',
  bubbleText: '#1A1B2E',
  bubbleShadow: 'rgba(0, 0, 0, 0.12)',
  bubbleUser: '#3B5998',
  bubbleUserText: '#FFFFFF',

  // Semantic
  success: '#34C759',
  successMuted: 'rgba(52, 199, 89, 0.12)',
  error: '#F87171',
  errorMuted: 'rgba(248, 113, 113, 0.12)',
  warning: '#FBBF24',
  warningMuted: 'rgba(251, 191, 36, 0.12)',
  info: '#4A7BD9',

  // Overlay
  overlay: 'rgba(26, 27, 46, 0.75)',
  overlayLight: 'rgba(26, 27, 46, 0.5)',

  // Tab bar
  tabBar: '#1A1B2E',
  tabBarBorder: '#3A3B5C',
};

export const gradients = {
  primary: ['#4A7BD9', '#3B5998', '#2D4474'] as const,
  accent: ['#7DD4C6', '#6EC6B8', '#5AAE9F'] as const,
  card: ['rgba(36, 37, 64, 0.9)', 'rgba(36, 37, 64, 0.6)'] as const,
  glow: ['rgba(110, 198, 184, 0.08)', 'rgba(110, 198, 184, 0)'] as const,
  surface: ['#242540', '#1A1B2E'] as const,
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
