import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

type Params = Record<string, string | number | boolean | null | undefined>;

/** Requests that take longer than this are reported as a timeout, not a dead server. */
const REQUEST_TIMEOUT_MS = 15000;

const MESSAGE = {
  offline: 'Please check your internet connection.',
  unavailable: 'Unable to connect. Please try again later.',
  timeout: 'Connection timed out. Please try again.',
  invalidCredentials: 'Incorrect email or password.',
  sessionExpired: 'Your session expired. Please log in again.',
  generic: 'Unable to complete your request. Please try again.',
} as const;

/** Thin promise-based wrapper around the Laravel API. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  constructor() {
    // Older builds let users save a server address on the device. It is no
    // longer read; clear it so a stale address can never affect a future build.
    try {
      localStorage.removeItem('fc_api_url');
    } catch {
      /* storage unavailable: nothing to clear */
    }
  }

  /** The one and only API address, supplied by the selected Angular environment. */
  get base(): string {
    return environment.apiUrl.replace(/\/+$/, '');
  }

  get<T>(path: string, params: Params = {}): Promise<T> {
    return this.resolve(this.http.get<T>(this.url(path), { params: this.params(params) }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.resolve(this.http.post<T>(this.url(path), body));
  }

  put<T>(path: string, body: unknown = {}): Promise<T> {
    return this.resolve(this.http.put<T>(this.url(path), body));
  }

  delete<T = void>(path: string): Promise<T> {
    return this.resolve(this.http.delete<T>(this.url(path)));
  }

  /** Multipart upload (photos). Empty / null values are skipped. */
  upload<T>(path: string, fields: Record<string, string | number | Blob | null | undefined>): Promise<T> {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined || value === '') continue;
      if (value instanceof Blob) {
        form.append(key, value, value instanceof File ? value.name : `${key}.jpg`);
      } else {
        form.append(key, String(value));
      }
    }
    return this.resolve(this.http.post<T>(this.url(path), form));
  }

  private resolve<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request.pipe(timeout(REQUEST_TIMEOUT_MS)));
  }

  private url(path: string): string {
    return `${this.base}/${path.replace(/^\//, '')}`;
  }

  private params(params: Params): HttpParams {
    let p = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined && value !== '') p = p.set(key, String(value));
    }
    return p;
  }
}

/**
 * Turn an API failure into one short, user-safe sentence.
 *
 * Technical details (IPs, ports, stack traces, URLs) and request data are never
 * shown to the user. A redacted summary is written to the developer console so
 * problems can still be diagnosed.
 */
export function errorMessage(err: unknown): string {
  // RxJS timeout() emits its own error object, not an HttpErrorResponse.
  if ((err as { name?: string } | null)?.name === 'TimeoutError') {
    logApiError(err, 'timeout');
    return MESSAGE.timeout;
  }

  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      logApiError(err, offline ? 'offline' : 'unreachable');
      return offline ? MESSAGE.offline : MESSAGE.unavailable;
    }

    const body = err.error as { message?: string; errors?: Record<string, string[]> } | null;
    const validationMessages = Object.values(body?.errors ?? {})
      .flat()
      .filter((value): value is string => typeof value === 'string');

    if (validationMessages.some((value) => /incorrect email or password/i.test(value))) {
      logApiError(err, 'invalid-credentials');
      return MESSAGE.invalidCredentials;
    }

    if (err.status === 401) {
      logApiError(err, 'unauthenticated');
      return MESSAGE.sessionExpired;
    }

    if (err.status >= 500) {
      logApiError(err, 'server-error');
      return MESSAGE.unavailable;
    }

    if (validationMessages.length) {
      logApiError(err, 'validation');
      return safeValidationMessage(validationMessages[0]);
    }

    logApiError(err, 'request-failed');
    return MESSAGE.generic;
  }

  logApiError(err, 'unexpected');
  return MESSAGE.generic;
}

/** Keep backend validation text readable, but strip anything that looks like infrastructure. */
function safeValidationMessage(message: string): string {
  const cleaned = message
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '')
    .replace(/localhost(?::\d+)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned && cleaned.length <= 160 ? cleaned : MESSAGE.generic;
}

/** Diagnostic only: no URL, request body, token or password is logged. */
function logApiError(err: unknown, detail: string): void {
  const info = err instanceof HttpErrorResponse
    ? { status: err.status, name: err.name, detail }
    : { name: err instanceof Error ? err.name : 'Error', detail };
  console.warn('[FacilityCare API]', info);
}
