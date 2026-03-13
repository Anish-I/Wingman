import type { ConfigContext, ExpoConfig } from '@expo/config';

import type { AppIconBadgeConfig } from 'app-icon-badge/types';

import 'tsx/cjs';

// eslint-disable-next-line perfectionist/sort-imports
import Env from './env';

const EXPO_ACCOUNT_OWNER = 'wingman';
const EAS_PROJECT_ID = 'FILL_AFTER_EAS_INIT';

const appIconBadgeConfig: AppIconBadgeConfig = {
  enabled: Env.EXPO_PUBLIC_APP_ENV !== 'production',
  badges: [
    {
      text: Env.EXPO_PUBLIC_APP_ENV,
      type: 'banner',
      color: 'white',
    },
    {
      text: Env.EXPO_PUBLIC_VERSION.toString(),
      type: 'ribbon',
      color: 'white',
    },
  ],
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: Env.EXPO_PUBLIC_NAME,
  description: 'Wingman — Your AI assistant via SMS',
  owner: EXPO_ACCOUNT_OWNER,
  scheme: Env.EXPO_PUBLIC_SCHEME,
  slug: 'wingman',
  version: Env.EXPO_PUBLIC_VERSION.toString(),
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  updates: {
    fallbackToCacheTimeout: 0,
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: Env.EXPO_PUBLIC_BUNDLE_ID,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCalendarsUsageDescription: 'Wingman reads and creates calendar events for you.',
      NSCameraUsageDescription: 'Scan QR codes or take a profile photo.',
      NSContactsUsageDescription: 'Message people from your contacts via Wingman.',
      NSMicrophoneUsageDescription: 'Send voice messages to Wingman.',
      NSPhotoLibraryUsageDescription: 'Set a profile photo.',
      NSUserNotificationsUsageDescription: 'Get reminders and automation alerts from Wingman.',
    },
  },
  experiments: {
    typedRoutes: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1A1B2E',
    },
    package: Env.EXPO_PUBLIC_PACKAGE,
    permissions: [
      'CAMERA',
      'READ_CONTACTS',
      'READ_CALENDAR',
      'WRITE_CALENDAR',
      'RECORD_AUDIO',
      'POST_NOTIFICATIONS',
      'READ_MEDIA_IMAGES',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        backgroundColor: '#1A1B2E',
        image: './assets/splash.png',
        imageWidth: 200,
      },
    ],
    [
      'expo-font',
      {
        ios: {
          fonts: [
            'node_modules/@expo-google-fonts/nunito-sans/400Regular/NunitoSans_400Regular.ttf',
            'node_modules/@expo-google-fonts/nunito-sans/600SemiBold/NunitoSans_600SemiBold.ttf',
            'node_modules/@expo-google-fonts/nunito-sans/700Bold/NunitoSans_700Bold.ttf',
            'node_modules/@expo-google-fonts/nunito-sans/800ExtraBold/NunitoSans_800ExtraBold.ttf',
          ],
        },
        android: {
          fonts: [
            {
              fontFamily: 'NunitoSans',
              fontDefinitions: [
                {
                  path: 'node_modules/@expo-google-fonts/nunito-sans/400Regular/NunitoSans_400Regular.ttf',
                  weight: 400,
                },
                {
                  path: 'node_modules/@expo-google-fonts/nunito-sans/600SemiBold/NunitoSans_600SemiBold.ttf',
                  weight: 600,
                },
                {
                  path: 'node_modules/@expo-google-fonts/nunito-sans/700Bold/NunitoSans_700Bold.ttf',
                  weight: 700,
                },
                {
                  path: 'node_modules/@expo-google-fonts/nunito-sans/800ExtraBold/NunitoSans_800ExtraBold.ttf',
                  weight: 800,
                },
              ],
            },
          ],
        },
      },
    ],
    'expo-localization',
    'expo-router',
    ['app-icon-badge', appIconBadgeConfig],
    ['react-native-edge-to-edge'],
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#3B5998',
      },
    ],
    [
      'expo-camera',
      { cameraPermission: 'Scan QR codes to connect apps.' },
    ],
    [
      'expo-calendar',
      { calendarPermission: 'Wingman can manage your calendar events.' },
    ],
  ],
  extra: {
    eas: {
      projectId: EAS_PROJECT_ID,
    },
  },
});
