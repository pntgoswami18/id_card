/**
 * Design tokens for the "Purple Workbench" MD3 identity — mirrors DESIGN.md's
 * YAML frontmatter (colors / typography / rounded / spacing / components) so
 * the MUI theme has a single, named source of truth instead of scattered hex
 * literals. Update DESIGN.md and this file together; they must stay in sync.
 *
 * No dark-mode variants are defined here — PRODUCT.md's Accessibility &
 * Inclusion section scopes this project to a WCAG AA light-only baseline.
 */

export const colors = {
  primary: '#6750A4',
  primaryLight: '#E8DEF8',
  primaryDark: '#381E72',
  secondary: '#625B71',
  secondaryLight: '#E8E0EC',
  secondaryDark: '#1D192B',
  error: '#B3261E',
  surface: '#FFFBFE',
  neutralBg: '#FEF7FF',
} as const;

export const typography = {
  body: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontWeight: 400,
  },
  heading: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    fontWeight: 400,
  },
} as const;

export const rounded = {
  sm: 8,
  md: 12,
  lg: 16,
  button: 20,
} as const;

export const spacing = {
  sm: 8,
  md: 16,
  lg: 24,
} as const;

export const elevation = {
  /** Hover/active state on interactive chrome (step indicators, alerts). */
  controlHover: 1,
  controlActive: 2,
  /** "Live card thumbnail floating above a surface" pattern. */
  floatingCardPreview: 3,
} as const;
