'use client';

import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { lightTheme, darkTheme } from './theme';
import { ThemeContextProvider, useThemeContext } from './context/ThemeContext';
import Footer from '@/components/layout/Footer';

function MUIThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeContext();
  const theme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <Box component="main" sx={{ flex: 1 }}>
          {children}
        </Box>
        <Footer />
      </Box>
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
