import { useColorScheme } from 'react-native';
import { usePreferences } from '@/features/preferences/context';
import { resolveAppearance } from '@/features/preferences/resolve';
import { colors } from './tokens';
export function useAppearance() {
  const { value } = usePreferences();
  return resolveAppearance(value.appearance, useColorScheme());
}
export const usePalette = () => colors[useAppearance()];
