import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.facilitycare.app',
  appName: 'FacilityCare',
  webDir: 'www',
  server: {
    // The Laravel API is served over plain HTTP on the local network during development.
    // Use the http scheme so the app is allowed to call it (no mixed-content blocking).
    androidScheme: 'http',
    cleartext: true,
  },
};

export default config;
