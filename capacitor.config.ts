import type { CapacitorConfig } from '@capacitor/cli';

// Per-build overrides come from build-capacitor.sh via env (one APK per entry
// in android-build-list.json — appId is PERMANENT per game once shipped).
const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID || 'com.dryadengine.engine',
  appName: process.env.CAP_APP_NAME || 'Dryad Engine',
  webDir: 'dist-capacitor',
  android: {
    allowMixedContent: false,
  },
};

export default config;
