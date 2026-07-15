import { createTheme } from '@mui/material/styles';
import { colors, typography, rounded } from './tokens';

// Material Design 3 inspired theme — palette/typography/shape values are
// sourced from ./tokens.ts (kept in sync with DESIGN.md's frontmatter).
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: colors.primary,
      light: colors.primaryLight,
      dark: colors.primaryDark,
    },
    secondary: {
      main: colors.secondary,
      light: colors.secondaryLight,
      dark: colors.secondaryDark,
    },
    error: {
      main: colors.error,
    },
    background: {
      default: colors.neutralBg,
      paper: colors.surface,
    },
  },
  shape: {
    // Outer app-shell Paper radius — deliberately larger than the `rounded`
    // component scale (max 16px), not part of the DESIGN.md token set.
    borderRadius: 28,
  },
  typography: {
    fontFamily: typography.body.fontFamily,
    h1: { fontWeight: typography.heading.fontWeight },
    h2: { fontWeight: typography.heading.fontWeight },
    h3: { fontWeight: typography.heading.fontWeight },
    h4: { fontWeight: typography.heading.fontWeight },
    h5: { fontWeight: typography.heading.fontWeight },
    h6: { fontWeight: typography.heading.fontWeight },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: rounded.button,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: rounded.md,
          elevation: 0,
        },
      },
    },
  },
});

export default theme;
