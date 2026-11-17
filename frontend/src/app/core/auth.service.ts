import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { REPORTER_ROLES, Role, User } from './models';

const TOKEN_KEY = 'fc_token';
const USER_KEY = 'fc_user';
const LAST_EMAIL_KEY = 'fc_last_email';
const NOTICE_KEY = 'fc_notice';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  readonly user = signal<User | null>(readJson<User>(USER_KEY));
  readonly isLoggedIn = computed(() => !!this.user() && !!this.token);
  /**
   * Why the app signed out by itself (e.g. the account was deactivated), shown on the login screen.
   * Kept in storage so it survives the app being reloaded or reopened; cleared on the next log in.
   */
  readonly notice = signal(safeGet(NOTICE_KEY) ?? '');

  setNotice(message: string): void {
    this.notice.set(message);
    if (message) safeSet(NOTICE_KEY, message);
    else safeRemove(NOTICE_KEY);
  }
  readonly role = computed<Role | null>(() => this.user()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isMaintenance = computed(() => this.role() === 'maintenance');
  readonly isReporter = computed(() => !!this.role() && REPORTER_ROLES.includes(this.role()!));

  get token(): string | null {
    return safeGet(TOKEN_KEY);
  }

  /**
   * remember = true keeps the user signed in after the app is closed (localStorage).
   * remember = false signs them out when the app/browser is closed (sessionStorage).
   */
  async login(email: string, password: string, remember = true): Promise<User> {
    const res = await this.api.post<{ token: string; user: User }>('login', { email, password });
    this.store(res.token, res.user, remember);
    if (remember) safeSet(LAST_EMAIL_KEY, email);
    else safeRemove(LAST_EMAIL_KEY);
    return res.user;
  }

  /** Email saved by the last "Remember me" sign-in, to prefill the form. */
  get lastEmail(): string {
    return safeGet(LAST_EMAIL_KEY) ?? '';
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
    // keep the profile next to the token (local or session storage)
    safeSet(USER_KEY, JSON.stringify(user), sessionOnly());
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

  private store(token: string, user: User, remember = true): void {
    safeRemove(TOKEN_KEY);
    safeRemove(USER_KEY);
    safeSet(TOKEN_KEY, token, !remember);
    this.setUser(user);
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string, session = false): void {
  try {
    (session ? sessionStorage : localStorage).setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
/** True when the current sign-in was made without "Remember me". */
function sessionOnly(): boolean {
  try {
    return !localStorage.getItem(TOKEN_KEY) && !!sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return false;
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
