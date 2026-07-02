import { useSyncExternalStore } from 'react';

/**
 * 響應式斷點判斷（client-only）。SSR / 首次 hydration 一律回傳 false，
 * 意即「行動端優先」——使用端（如 ResponsiveFormSheet）在桌機上會於
 * hydration 後切換，因為這類元件只在使用者互動（開啟表單）後才渲染，
 * 不會造成可見的閃爍。
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
