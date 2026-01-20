'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeContextProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [mounted, setMounted] = useState(false);

  // 在客戶端載入時讀取 localStorage 和系統偏好
  useEffect(() => {
    setMounted(true);
    const savedMode = localStorage.getItem('theme-mode') as ThemeMode | null;

    if (savedMode) {
      setMode(savedMode);
      document.documentElement.setAttribute('data-theme', savedMode);
    } else {
      // 檢查系統偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialMode = prefersDark ? 'dark' : 'light';
      setMode(initialMode);
      document.documentElement.setAttribute('data-theme', initialMode);
    }
  }, []);

  // 監聽系統主題變化
  useEffect(() => {
    if (!mounted) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // 只在沒有手動設置時跟隨系統
      const savedMode = localStorage.getItem('theme-mode');
      if (!savedMode) {
        setMode(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [mounted]);

  const toggleTheme = () => {
    setMode((prevMode) => {
      const newMode = prevMode === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme-mode', newMode);
      document.documentElement.setAttribute('data-theme', newMode);
      return newMode;
    });
  };

  const setThemeMode = (newMode: ThemeMode) => {
    setMode(newMode);
    localStorage.setItem('theme-mode', newMode);
    document.documentElement.setAttribute('data-theme', newMode);
  };

  // 避免 SSR 和客戶端不匹配的問題
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  return context || {
    mode: 'light' as ThemeMode,
    toggleTheme: () => {},
    setThemeMode: () => {}
  };
}
