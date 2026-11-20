// Production settings (used by `ng build --configuration production` and the mobile app).
//
// This is the single source of truth for the API address. The Android build
// workflow can override it at build time with the repository variable API_URL.
// Use a publicly reachable HTTPS URL for releases so the app works on Wi-Fi or
// mobile data. The address below is only a local Wi-Fi fallback for testing.
export const environment = {
  production: true,
  apiUrl: 'http://10.242.83.162:8000/api',
};
