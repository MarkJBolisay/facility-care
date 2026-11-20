// Development settings (used by `npm start` / `ng serve`).
//
// When the dev server is opened on a phone through the PC's LAN address
// (e.g. http://10.242.83.162:4200), "localhost" in the phone's browser means
// the phone itself, not the PC. Derive the API host from the page host instead.
const host = typeof window !== 'undefined' && window.location.hostname
  ? window.location.hostname
  : 'localhost';
const apiUrl = host === 'localhost' || host === '127.0.0.1'
  ? 'http://localhost:8000/api'
  : `http://${host}:8000/api`;

export const environment = {
  production: false,
  apiUrl,
};
