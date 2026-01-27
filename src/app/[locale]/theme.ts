'use client';

import { createTheme, ThemeOptions, alpha } from '@mui/material/styles';

// 共用的 Typography 和 Shape 設定
const commonSettings: Pick<ThemeOptions, 'typography' | 'shape'> = {
  typography: {
    fontFamily: [
      'var(--font-inter)', // Use the CSS variable from Next.js font
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontWeight: 800,
      fontSize: '2.5rem',
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontWeight: 700,
      fontSize: '2rem',
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 700,
      fontSize: '1.75rem',
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.4,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.5,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    subtitle1: {
      fontSize: '1rem',
      lineHeight: 1.75,
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: '0.875rem',
      lineHeight: 1.57,
      fontWeight: 600,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: 12, // More grounded, modern radius
  },
};

// Professional Color Palette (Slate & Indigo)
const colors = {
  primary: {
    main: '#4F46E5', // Indigo 600
    dark: '#4338CA', // Indigo 700
    light: '#818CF8', // Indigo 400
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#64748B', // Slate 500
    dark: '#475569', // Slate 600
    light: '#94A3B8', // Slate 400
    contrastText: '#ffffff',
  },
  success: {
    main: '#10B981', // Emerald 500
    dark: '#059669',
    light: '#34D399',
  },
  error: {
    main: '#EF4444', // Red 500
    dark: '#DC2626',
    light: '#F87171',
  },
  background: {
    light: '#F8FAFC', // Slate 50
    paperLight: '#FFFFFF',
    dark: '#0F172A', // Slate 900
    paperDark: '#1E293B', // Slate 800
  },
  text: {
    primaryLight: '#0F172A', // Slate 900
    secondaryLight: '#64748B', // Slate 500
    primaryDark: '#F8FAFC', // Slate 50
    secondaryDark: '#94A3B8', // Slate 400
  },
};

// 淺色主題
export const lightTheme = createTheme({
  ...commonSettings,
  palette: {
    mode: 'light',
    primary: colors.primary,
    secondary: colors.secondary,
    success: colors.success,
    error: colors.error,
    background: {
      default: colors.background.light,
      paper: colors.background.paperLight,
    },
    text: {
      primary: colors.text.primaryLight,
      secondary: colors.text.secondaryLight,
    },
    divider: alpha('#64748B', 0.1),
    action: {
      hover: alpha('#64748B', 0.04),
      selected: alpha('#64748B', 0.08),
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.background.light,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '8px 20px',
          boxShadow: 'none',
          transition: 'all 0.2s ease-in-out',
          '&:active': {
            transform: 'scale(0.98)',
          },
        },
        contained: {
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderColor: alpha(colors.secondary.main, 0.3),
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
          backgroundImage: 'none',
          border: '1px solid',
          borderColor: alpha('#64748B', 0.1),
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        },
        elevation2: {
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            '& fieldset': {
              borderColor: alpha('#64748B', 0.2),
            },
            '&:hover fieldset': {
              borderColor: alpha('#64748B', 0.4),
            },
            '&.Mui-focused fieldset': {
              borderWidth: 1,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(colors.background.paperLight, 0.8),
          backdropFilter: 'blur(12px)',
          boxShadow: 'none',
          borderBottom: '1px solid',
          borderColor: alpha('#64748B', 0.1),
        },
      },
    },
  },
});

// 深色主題
export const darkTheme = createTheme({
  ...commonSettings,
  palette: {
    mode: 'dark',
    primary: {
      main: '#818CF8', // Indigo 400
      dark: '#6366F1', // Indigo 500
      light: '#A5B4FC', // Indigo 300
      contrastText: '#000',
    },
    secondary: {
      main: '#94A3B8', // Slate 400
      dark: '#64748B', // Slate 500
      light: '#CBD5E1', // Slate 300
      contrastText: '#0f172a',
    },
    success: {
      main: '#34D399',
      dark: '#10B981',
      light: '#6EE7B7',
    },
    error: {
      main: '#F87171',
      dark: '#EF4444',
      light: '#FCA5A5',
    },
    background: {
      default: colors.background.dark,
      paper: colors.background.paperDark,
    },
    text: {
      primary: colors.text.primaryDark,
      secondary: colors.text.secondaryDark,
    },
    divider: alpha('#94A3B8', 0.1),
    action: {
      hover: alpha('#94A3B8', 0.05),
      selected: alpha('#94A3B8', 0.1),
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: colors.background.dark,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '8px 20px',
          boxShadow: 'none',
          transition: 'all 0.2s ease-in-out',
          '&:active': {
            transform: 'scale(0.98)',
          },
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(129, 140, 248, 0.2)', // glow effect
          },
        },
        outlined: {
          borderColor: alpha('#94A3B8', 0.3),
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: 'none',
          border: '1px solid',
          borderColor: alpha('#94A3B8', 0.1),
          backgroundImage: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            '& fieldset': {
              borderColor: alpha('#94A3B8', 0.2),
            },
            '&:hover fieldset': {
              borderColor: alpha('#94A3B8', 0.4),
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          border: '1px solid',
          borderColor: alpha('#94A3B8', 0.1),
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(colors.background.paperDark, 0.8),
          backdropFilter: 'blur(12px)',
          boxShadow: 'none',
          borderBottom: '1px solid',
          borderColor: alpha('#94A3B8', 0.1),
        },
      },
    },
  },
});

// 向後兼容的預設匯出
export const theme = lightTheme;
