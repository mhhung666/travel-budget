import { useEffect, type PropsWithChildren } from 'react';
import { Appearance, Platform } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { usePreferences } from './context';
import { useAppearance, usePalette } from '@/theme/usePalette';

export function AppAppearance({ children }: PropsWithChildren) {
  const { value } = usePreferences();
  const scheme = useAppearance();
  const p = usePalette();
  useEffect(() => {
    if (Platform.OS !== 'web')
      Appearance.setColorScheme(value.appearance === 'system' ? 'unspecified' : value.appearance);
    return () => {
      if (Platform.OS !== 'web') Appearance.setColorScheme('unspecified');
    };
  }, [value.appearance]);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          background: p.background,
          card: p.surface,
          text: p.text,
          border: p.border,
          primary: p.primary,
        },
      }}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeProvider>
  );
}
