/**
 * Wingman Design Tokens — "Premium Assistant OS"
 *
 * Color hierarchy (revised for premium assistant OS):
 *   Purple  → primary action / brand accent (confident, trustworthy)
 *   Teal    → secondary / assistant status / highlight (calming, professional)
 *   Blue    → info / links (demoted from primary)
 *
 * Surface depth (dark theme):
 *   bg → card → cardAlt → section → elevated → overlay
 *   Each step adds ~8-15 lightness for **intentional** visual separation.
 *   Surfaces are NOT interchangeable — each has a purpose.
 */

// ── Brand Accent ──────────────────────────────────────────────
export const purple = {
  50: '#F3EEFF',
  100: '#E4D9FF',
  200: '#C9B3FF',
  300: '#AA8AFF',
  400: '#9171F5',
  500: '#7C5CFC', // primary action — trust, clarity, brand identity
  600: '#6545DB',
  700: '#4F32B3',
  800: '#3A228A',
  900: '#261562',
  muted: 'rgba(124, 92, 252, 0.22)',
  /** Subtle glow for premium elevations */
  glow: 'rgba(124, 92, 252, 0.08)',
} as const;

export const teal = {
  50: '#EDFAF7',
  100: '#D0F2EB',
  200: '#A1E5D7',
  300: '#6EC6B8', // secondary accent — assistant, status, confidence
  400: '#5AAE9F',
  500: '#48968A', // depth tone
  600: '#377A6F',
  muted: 'rgba(110, 198, 184, 0.22)',
  /** Subtle glow for teal accents */
  glow: 'rgba(110, 198, 184, 0.06)',
} as const;

// ── Base contrast (text/icons on filled colored surfaces) ─────
export const base = {
  white: '#FFFFFF',
  black: '#000000',
} as const;

// ── Surfaces (dark theme depth) ───────────────────────────────
export const surface = {
  /** Deepest background — app chrome, page root */
  bg: '#0A0A0C',
  /** Primary card / container surface — standard content cards, app cards */
  card: '#131315',
  /** Alternate card — **intentionally** use for secondary content to break repetition */
  cardAlt: '#161619',
  /** Section container — grouped content, nested sections, form groups */
  section: '#1A1A1E',
  /** Raised elements: inputs, modals, elevated cards, floating actions */
  elevated: '#1F1F24',
  /** Default border — subtle separation between surfaces */
  border: '#232330',
  /** Stronger border — focused inputs, active states, prominent dividers */
  borderStrong: '#35354A',
  /** Overlay backdrop */
  overlay: 'rgba(0, 0, 0, 0.72)',
  /** Premium glow line — top accent for cards */
  glow: 'rgba(124, 92, 252, 0.03)',
} as const;

// ── Surfaces (light theme) ────────────────────────────────────
export const surfaceLight = {
  bg: '#FFFFFF',
  card: '#F5F5F7',
  cardAlt: '#EFEFF2',
  section: '#E8E8ED',
  elevated: '#FFFFFF',
  border: '#D1D1D6',
  borderStrong: '#B0B0BA',
  overlay: 'rgba(0, 0, 0, 0.35)',
  glow: 'rgba(124, 92, 252, 0.06)',
} as const;

// ── Text ──────────────────────────────────────────────────────
export const text = {
  /** High-contrast primary — intentionally warm-white, approachable */
  primary: '#F0F0F5',
  /** Secondary — body text, longer content (high legibility) */
  secondary: '#D2D2DE',
  /** Muted — labels, metadata, hints (WCAG AA on all dark surfaces incl. card, ~9:1 on #131315) */
  muted: '#B0B0BE',
  /** Disabled / placeholder text — visually distinct from secondary, WCAG AA on dark surfaces */
  disabled: '#8E8E9D',
  /** Inverse for light/elevated surfaces */
  inverse: '#0A0A0C',
} as const;

// ── Text (light theme) ───────────────────────────────────────
export const textLight = {
  primary: '#1C1C1E',
  secondary: '#3C3C43',
  muted: '#6B6B7A',
  disabled: '#AEAEB2',
  inverse: '#F0F0F5',
} as const;

// ── Semantic ──────────────────────────────────────────────────
export const semantic = {
  success: '#32D74B',
  error: '#FF453A',
  warning: '#FFD60A',
  info: '#6B9BEF',
} as const;

// ── Semantic (light theme — better contrast on white) ────────
export const semanticLight = {
  success: '#16A34A',
  error: '#DC2626',
  warning: '#D97706',
  info: '#2563EB',
} as const;

// ── Legacy blue (demoted to info / link) ──────────────────────
export const blue = {
  400: '#6B9BEF',
  500: '#3B5998',
  600: '#2D4474',
  muted: 'rgba(107, 155, 239, 0.22)',
} as const;

// ── Typography ────────────────────────────────────────────────
export const typography = {
  hero: {
    fontFamily: 'Sora_700Bold',
    fontSize: 30,
    letterSpacing: -1.2,
    lineHeight: 36,
  },
  title: {
    fontFamily: 'Sora_700Bold',
    fontSize: 22,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  subtitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
} as const;

// ── Spacing ──────────────────────────────────────────────────
/**
 * 4-point grid spacing scale.
 * Use these instead of hard-coded pixel values for consistent rhythm.
 *
 *   xs  (4)   — tight inline gaps (icon–text, status indicators)
 *   sm  (8)   — small component gaps (header groups, chip grids)
 *   md  (12)  — medium gaps (section internals, input bars, list padding)
 *   lg  (16)  — large gaps (between sections, screen header bar padding)
 *   xl  (20)  — extra-large gaps (major section separators)
 *   '2xl' (24) — screen-level horizontal padding, content gaps
 *   '3xl' (32) — screen-level bottom safe-area padding
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

// ── Layout ──────────────────────────────────────────────────
/**
 * Standardised layout constants for consistent screen structure.
 * Use these for screen-level padding, section spacing, and content gaps
 * instead of ad-hoc Tailwind classes (px-4/px-6/mt-4/gap-3/etc.).
 */
export const layout = {
  /** Screen horizontal padding — consistent edge insets across all screens */
  screenPaddingH: spacing['2xl'],  // 24px
  /** Screen top padding for content headers */
  screenPaddingTop: spacing['2xl'],  // 24px
  /** Screen bottom safe-area / footer padding */
  screenPaddingBottom: spacing['3xl'],  // 32px
  /** Gap between major sections on a screen */
  sectionGap: spacing['2xl'],  // 24px
  /** Gap between items within a section (cards, rows, list items) */
  itemGap: spacing.md,  // 12px
  /** Gap between inline elements (icon–label, badge pairs) */
  inlineGap: spacing.sm,  // 8px
} as const;

// ── Radii ─────────────────────────────────────────────────────
export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 9999,
} as const;

// ── Shadows (iOS / Android / Web) ─────────────────────────────
export const shadows = {
  /** Subtle card lift — standard content cards */
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  /** Medium lift — action cards, buttons, interactive elements */
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  /** Stronger lift for modals, overlays, FABs */
  elevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  /** Purple glow for primary action buttons (confidence, trust) */
  purpleGlow: {
    shadowColor: purple[500],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  /** Teal glow for assistant/secondary elements */
  tealGlow: {
    shadowColor: teal[300],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

// ── Component presets ─────────────────────────────────────────
/** Reusable style objects for common patterns */
export const presets = {
  /** Standard card container — default content card */
  card: {
    backgroundColor: surface.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: surface.border,
  },
  /** Alternate card — **must** be used between adjacent cards to avoid visual repetition */
  cardAlt: {
    backgroundColor: surface.cardAlt,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: surface.border,
  },
  /** Section container — grouped content, form groups, nested sections */
  cardSection: {
    backgroundColor: surface.section,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: surface.border,
  },
  /** Elevated card — modals, overlays, floating containers */
  cardElevated: {
    backgroundColor: surface.elevated,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: surface.borderStrong,
    ...shadows.elevated,
  },
  /** Premium card with subtle glow accent */
  cardPremium: {
    backgroundColor: surface.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: surface.borderStrong,
    borderTopColor: purple.glow,
    borderTopWidth: 0.5,
  },
  /** Standard input field — form inputs, text entry */
  inputField: {
    height: 52,
    borderRadius: radii.md,
    backgroundColor: surface.elevated,
    borderWidth: 1,
    borderColor: surface.border,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  /** Focused input field — visual feedback on interaction */
  inputFieldFocused: {
    borderColor: purple[500],
    borderWidth: 1.5,
    backgroundColor: surface.elevated,
  },
  /** Primary action button — gradient purple, strong shadow */
  primaryButton: {
    height: 56,
    borderRadius: radii.md,
    backgroundColor: purple[500],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...shadows.purpleGlow,
  },
  /** Secondary action button — outline style, clear affordance */
  secondaryButton: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: purple[500],
    backgroundColor: 'transparent',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  /** Social / third-party auth button — elevated, outlined */
  socialButton: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: surface.borderStrong,
    backgroundColor: surface.card,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    ...shadows.card,
  },
  /** Trust / security footnote — dense, centered, subdued */
  trustNote: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: surface.section,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: surface.border,
  },
} as const;

// ── Theme-aware hook ─────────────────────────────────────────
import { useUniwind } from 'uniwind';

/**
 * Returns surface + text tokens that match the active theme.
 * Use this in components instead of importing `surface` / `text` directly
 * so that light mode renders correctly.
 */
export function useThemeColors() {
  const { theme } = useUniwind();
  const isDark = theme === 'dark';
  return {
    surface: isDark ? surface : surfaceLight,
    text: isDark ? text : textLight,
    semantic: isDark ? semantic : semanticLight,
    isDark,
  } as const;
}

// ── Convenience re-export for inline styles ───────────────────
const tokens = {
  base,
  purple,
  teal,
  surface,
  surfaceLight,
  text,
  textLight,
  semantic,
  blue,
  typography,
  spacing,
  layout,
  radii,
  shadows,
  presets,
} as const;
export default tokens;
