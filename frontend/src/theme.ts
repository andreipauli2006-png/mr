import { createTheme } from '@mui/material'

export type Mode = 'light' | 'dark'

export function makeTheme(mode: Mode) {
  return createTheme({
    palette: {
      mode,
      primary: { main: '#3D5AFE' },
      secondary: { main: '#00BFA5' },
      background: mode === 'light' ? { default: '#F5F6FA', paper: '#FFFFFF' } : {},
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { textTransform: 'none' } },
      },
      MuiCard: { defaultProps: { variant: 'outlined' } },
      MuiPaper: { defaultProps: { variant: 'outlined' } },
      MuiAppBar: { defaultProps: { elevation: 0 } },
    },
  })
}
