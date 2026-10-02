import type { ExpoConfig } from 'expo/config';

import { version } from './package.json';

const config: ExpoConfig = {
  name: 'Travel Budget',
  slug: 'travel-budget-mobile',
  version,
  scheme: 'travelbudget',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  ios: { supportsTablet: true },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundColor: '#E6F4FE',
    },
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/images/favicon.png' },
  plugins: ['expo-router', 'expo-localization', 'expo-splash-screen', 'expo-secure-store'],
  experiments: { typedRoutes: true },
};

export default config;
