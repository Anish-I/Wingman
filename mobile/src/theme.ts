// Wingman Design System — "Pip"
// Premium dark surfaces, purple accent, glassmorphism depth

export const colors = {
  // Surface hierarchy (darkest → lightest)
  background: '#0f0f1a',
  backgroundElevated: '#1a1a2e',
  card: '#1a1a2e',
  cardHover: '#242442',
  cardElevated: '#242442',
  inputBg: '#1a1a2e',

  // Glassmorphism
  glass: 'rgba(255, 255, 255, 0.05)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassElevated: 'rgba(255, 255, 255, 0.08)',

  // Borders & dividers
  border: '#2a2a4e',
  borderLight: '#2a2a4e',
  borderSubtle: '#1f1f35',

  // Brand — purple accent
  primary: '#6c63ff',
  primaryLight: '#8b83ff',
  primaryDark: '#5549e0',
  primaryMuted: 'rgba(108, 99, 255, 0.15)',

  // Accent — teal highlight
  teal: '#00d4d4',
  accent: '#00d4d4',
  accentDark: '#00b3b3',
  accentMuted: 'rgba(0, 212, 212, 0.12)',
  accentGlow: 'rgba(0, 212, 212, 0.25)',

  // Extended palette
  purple: '#6c63ff',
  purpleLight: '#8b83ff',
  orange: '#F5A623',

  // Text
  text: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#c8c8e6',
  textMuted: '#9aa0be',
  textInverse: '#0f0f1a',

  // Chat bubbles
  bubble: '#FFFFFF',
  bubbleText: '#0f0f1a',
  bubbleShadow: 'rgba(0, 0, 0, 0.12)',
  bubbleUser: '#6c63ff',
  bubbleUserText: '#FFFFFF',

  // Semantic
  success: '#00c896',
  successMuted: 'rgba(0, 200, 150, 0.12)',
  error: '#F87171',
  errorMuted: 'rgba(248, 113, 113, 0.12)',
  warning: '#FBBF24',
  warningMuted: 'rgba(251, 191, 36, 0.12)',
  info: '#6c63ff',

  // Overlay
  overlay: 'rgba(15, 15, 26, 0.85)',
  overlayLight: 'rgba(15, 15, 26, 0.5)',

  // Tab bar
  tabBar: '#1a1a2e',
  tabBarBorder: '#2a2a4e',
};

export const gradients = {
  primary: ['#8b83ff', '#6c63ff', '#5549e0'] as const,
  accent: ['#00e6e6', '#00d4d4', '#00b3b3'] as const,
  card: ['rgba(26, 26, 46, 0.9)', 'rgba(26, 26, 46, 0.6)'] as const,
  glow: ['rgba(0, 212, 212, 0.08)', 'rgba(0, 212, 212, 0)'] as const,
  surface: ['#1a1a2e', '#0f0f1a'] as const,
  purple: ['#8b83ff', '#6c63ff'] as const,
  purpleDark: ['#6c63ff', '#5549e0'] as const,
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
  card: 16,
  button: 12,
  pill: 24,
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
