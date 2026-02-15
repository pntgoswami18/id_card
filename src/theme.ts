import { createTheme } from '@mui/material/styles';

// Material Design 3 inspired theme
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6750A4',
      light: '#E8DEF8',
      dark: '#381E72',
    },
    secondary: {
      main: '#625B71',
      light: '#E8E0EC',
      dark: '#1D192B',
    },
    error: {
      main: '#B3261E',
    },
    background: {
      default: '#FEF7FF',
      paper: '#FFFBFE',
    },
  },
  shape: {
    borderRadius: 28,
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 400 },
    h2: { fontWeight: 400 },
    h3: { fontWeight: 400 },
    h4: { fontWeight: 400 },
    h5: { fontWeight: 400 },
    h6: { fontWeight: 400 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 20,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          elevation: 0,
        },
      },
    },
  },
});

export default theme;
