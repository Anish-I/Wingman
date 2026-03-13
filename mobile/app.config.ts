export default {
  name: 'Wingman',
  slug: 'wingman',
  scheme: 'wingman',
  version: '1.0.0',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/splash.png',
    backgroundColor: '#0f0f1a',
    resizeMode: 'contain',
  },
  ios: {
    bundleIdentifier: 'com.wingman.app',
    supportsTablet: false,
    infoPlist: {
      NSCalendarsUsageDescription: 'Wingman reads and creates calendar events for you.',
      NSCameraUsageDescription: 'Scan QR codes or take a profile photo.',
      NSContactsUsageDescription: 'Message people from your contacts via Wingman.',
      NSMicrophoneUsageDescription: 'Send voice messages to Wingman.',
      NSPhotoLibraryUsageDescription: 'Set a profile photo.',
      NSUserNotificationsUsageDescription: 'Get reminders and automation alerts from Wingman.',
    },
  },
  android: {
    package: 'com.wingman.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0f0f1a',
    },
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
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/icon.png',
        color: '#6c63ff',
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
    eas: { projectId: 'FILL_AFTER_EAS_INIT' },
  },
};
