import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiBase, apiHost } from './server';

type Params = Record<string, string | number | boolean | null | undefined>;

/** Thin promise-based wrapper around the Laravel API. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  /** Current API address (can be changed in the app, see server.ts). */
  get base(): string {
    return apiBase();
  }

  get<T>(path: string, params: Params = {}): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(path), { params: this.params(params) }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body));
  }

  put<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.url(path), body));
  }

  delete<T = void>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.url(path)));
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
    return firstValueFrom(this.http.post<T>(this.url(path), form));
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

/** Turn a Laravel error response into one readable sentence. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return `Cannot reach the server at ${apiHost()}. Make sure the backend is running and your phone is on the same Wi-Fi. You can change the server address on the login screen.`;
    }
    const body = err.error as { message?: string; errors?: Record<string, string[]> } | null;
    if (body?.errors) {
      const first = Object.values(body.errors)[0];
      if (first?.length) return first[0];
    }
    if (body?.message) return body.message;
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
