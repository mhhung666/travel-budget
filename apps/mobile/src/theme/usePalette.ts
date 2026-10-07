import { useColorScheme } from 'react-native';
import { colors } from './tokens';
export const usePalette = () => colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
