import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { REPORTER_ROLES, Role, User } from './models';

const TOKEN_KEY = 'fc_token';
const USER_KEY = 'fc_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly user = signal<User | null>(readJson<User>(USER_KEY));
  readonly isLoggedIn = computed(() => !!this.user() && !!this.token);
  readonly role = computed<Role | null>(() => this.user()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isMaintenance = computed(() => this.role() === 'maintenance');
  readonly isReporter = computed(() => !!this.role() && REPORTER_ROLES.includes(this.role()!));

  get token(): string | null {
    return safeGet(TOKEN_KEY);
  }

  async login(email: string, password: string): Promise<User> {
    const res = await this.api.post<{ token: string; user: User }>('login', { email, password });
    this.store(res.token, res.user);
    return res.user;
  }

  async register(data: Record<string, unknown>): Promise<User> {
    const res = await this.api.post<{ token: string; user: User }>('register', data);
    this.store(res.token, res.user);
    return res.user;
  }

  /** Refresh the cached profile (e.g. after an admin changes the role). */
  async refresh(): Promise<void> {
    if (!this.token) return;
    const user = await this.api.get<User>('me');
    this.setUser(user);
  }

  setUser(user: User): void {
    this.user.set(user);
    safeSet(USER_KEY, JSON.stringify(user));
  }

  async logout(callApi = true): Promise<void> {
    if (callApi && this.token) {
      try {
        await this.api.post('logout');
      } catch {
        /* token may already be invalid */
      }
    }
    safeRemove(TOKEN_KEY);
    safeRemove(USER_KEY);
    this.user.set(null);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /** First screen for each role. */
  homeUrl(role: Role | null = this.role()): string {
    switch (role) {
      case 'admin':
        return '/tabs/dashboard';
      case 'maintenance':
        return '/tabs/home';
      case null:
        return '/login';
      default:
        return '/tabs/my-home';
    }
  }

  private store(token: string, user: User): void {
    safeSet(TOKEN_KEY, token);
    this.setUser(user);
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
function readJson<T>(key: string): T | null {
  try {
    const raw = safeGet(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
