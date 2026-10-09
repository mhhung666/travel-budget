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
  locales: {
    'zh-Hant': {
      ios: {
        NSCameraUsageDescription: '允許 Travel Budget 拍攝收據。',
        NSPhotoLibraryUsageDescription: '允許 Travel Budget 選擇收據圖片。',
      },
    },
    'zh-Hans': {
      ios: {
        NSCameraUsageDescription: '允许 Travel Budget 拍摄收据。',
        NSPhotoLibraryUsageDescription: '允许 Travel Budget 选择收据图片。',
      },
    },
    en: {
      ios: {
        NSCameraUsageDescription: 'Allow Travel Budget to photograph receipts.',
        NSPhotoLibraryUsageDescription: 'Allow Travel Budget to select receipt images.',
      },
    },
    ja: {
      ios: {
        NSCameraUsageDescription: 'Travel Budgetによる領収書の撮影を許可します。',
        NSPhotoLibraryUsageDescription: 'Travel Budgetによる領収書画像の選択を許可します。',
      },
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundColor: '#E6F4FE',
    },
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    'expo-localization',
    'expo-splash-screen',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        cameraPermission: 'Allow Travel Budget to photograph receipts.',
        photosPermission: 'Allow Travel Budget to select receipt images.',
        microphonePermission: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
