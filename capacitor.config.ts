import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.jellybaby.hop',
  appName: 'Jelly Hop',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
