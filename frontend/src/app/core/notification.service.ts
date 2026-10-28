import { Injectable, effect, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/** Keeps the unread badge up to date by polling every 30 seconds while signed in. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly unread = signal(0);

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) {
        this.start();
      } else {
        this.stop();
        this.unread.set(0);
      }
    });
  }

  async refresh(): Promise<void> {
    if (!this.auth.token) return;
    try {
      const res = await this.api.get<{ count: number }>('notifications/unread-count');
      this.unread.set(res.count);
    } catch {
      /* ignore polling errors */
    }
  }

  private start(): void {
    if (this.timer) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 30000);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
