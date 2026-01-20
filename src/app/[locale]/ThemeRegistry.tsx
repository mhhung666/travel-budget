'use client';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { lightTheme, darkTheme } from './theme';
import { ThemeContextProvider, useThemeContext } from './context/ThemeContext';

function MUIThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeContext();
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContextProvider>
      <MUIThemeProvider>{children}</MUIThemeProvider>
    </ThemeContextProvider>
  );
}
