import { createTheme } from '@mui/material/styles'

export const healthcareTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#155e75',
      dark: '#0f4556',
      light: '#4f9eb2',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#6b5b1d',
      dark: '#4b3f14',
      light: '#a49247',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f6f8fb',
      paper: '#ffffff',
    },
    text: {
      primary: '#17212b',
      secondary: '#5d6978',
    },
    error: {
      main: '#b42318',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: 0 },
    h2: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: 0 },
    h3: { fontSize: '1.2rem', fontWeight: 700, letterSpacing: 0 },
    button: { fontWeight: 700, textTransform: 'none', letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 40,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #dfe6ee',
          boxShadow: '0 10px 24px rgba(25, 43, 58, 0.06)',
        },
      },
    },
  },
})
