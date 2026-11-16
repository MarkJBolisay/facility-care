import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Where the app finds the Laravel backend.
 *
 * The phone app talks to the backend running on a laptop on the same Wi-Fi.
 * That laptop's IP address changes (new Wi-Fi, router restart), so the address
 * can be changed inside the app ("Server" link on the login screen) instead of
 * rebuilding the APK. The address typed in is saved on the phone; when nothing
 * is saved, the address built into the app (environment.apiUrl) is used.
 */
const KEY = 'fc_api_url';

/** The API address in use, e.g. http://192.168.100.115:8000/api */
export function apiBase(): string {
  try {
    return localStorage.getItem(KEY) || environment.apiUrl;
  } catch {
    return environment.apiUrl;
  }
}

/** True when the user saved their own address (instead of the built-in one). */
export function hasCustomApiBase(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

/** Save an address (already normalized), or go back to the built-in one with null. */
export function setApiBase(url: string | null): void {
  try {
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: keep using the built-in address */
  }
}

/** Short form for display: "192.168.100.115:8000". */
export function apiHost(base = apiBase()): string {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}

/**
 * Accepts what a person would type and turns it into a full API address:
 *   192.168.100.115            -> http://192.168.100.115:8000/api
 *   192.168.100.115:8000       -> http://192.168.100.115:8000/api
 *   http://192.168.100.115:8000 -> http://192.168.100.115:8000/api
 *   https://myserver.com/api   -> https://myserver.com/api
 * Returns null when it can't be read as an address.
 */
export function normalizeApiBase(input: string): string | null {
  let s = (input ?? '').trim().replace(/\s+/g, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (!url.hostname) return null;
  // a bare IP / computer name means the Laravel dev server on port 8000
  const bareHost = /^[\d.]+$/.test(url.hostname) || !url.hostname.includes('.');
  if (!url.port && url.protocol === 'http:' && bareHost) url.port = '8000';
  let path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/api')) path += '/api';
  return `${url.protocol}//${url.host}${path}`;
}

/**
 * Checks that the backend answers at this address. Any HTTP reply counts
 * (a 401 from /me means "the server is there, you're just not logged in").
 */
export async function canReach(http: HttpClient, base: string): Promise<boolean> {
  try {
    await firstValueFrom(http.get(`${base}/me`).pipe(timeout(6000)));
    return true;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    return typeof status === 'number' && status > 0;
  }
}
