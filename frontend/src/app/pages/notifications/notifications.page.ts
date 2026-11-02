import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AppNotification, Paginated } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

const ICONS: Record<string, string> = {
  report: 'document-text-outline',
  assignment: 'hammer-outline',
  status: 'refresh-outline',
  announcement: 'megaphone-outline',
  reminder: 'alarm-outline',
  info: 'notifications-outline',
};

@Component({
  selector: 'app-notifications',
  imports: [...IONIC, ...SHARED],
  template: `
    <ion-header>
      <ion-toolbar>
        @if (!inTabs) {
          <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.homeUrl()" /></ion-buttons>
        }
        <ion-title>Notifications</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="markAll()" [disabled]="!notifications.unread()">
            <ion-icon slot="icon-only" name="checkmark-done-outline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        <ion-list class="cards">
          @for (n of items(); track n.id) {
            <ion-item button [detail]="!!(n.report_id || n.work_order_id)" (click)="open(n)" [class.unread]="!n.read_at">
              <ion-icon slot="start" [name]="icon(n.type)" [color]="n.read_at ? 'medium' : 'primary'" />
              <ion-label class="ion-text-wrap">
                <h3 [style.font-weight]="n.read_at ? 500 : 700">{{ n.title }}</h3>
                <p>{{ n.message }}</p>
                <p class="small">{{ n.created_at | ago }}{{ n.sender ? ' · from ' + n.sender.name : '' }}</p>
              </ion-label>
            </ion-item>
          } @empty {
            <app-empty text="No notifications yet." icon="notifications-outline" />
          }
        </ion-list>
        <ion-infinite-scroll [disabled]="page() >= lastPage()" (ionInfinite)="more($event)">
          <ion-infinite-scroll-content />
        </ion-infinite-scroll>
      </div>
    </ion-content>
  `,
})
export class NotificationsPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  protected auth = inject(AuthService);
  protected notifications = inject(NotificationService);

  protected inTabs = this.router.url.startsWith('/tabs');
  protected items = signal<AppNotification[]>([]);
  protected page = signal(1);
  protected lastPage = signal(1);

  ionViewWillEnter(): void {
    void this.reload();
  }

  icon(type: string): string {
    return ICONS[type] ?? ICONS['info'];
  }

  async reload(event?: Event): Promise<void> {
    await this.fetch(1);
    void this.notifications.refresh();
    completeRefresh(event);
  }

  async more(event: Event): Promise<void> {
    await this.fetch(this.page() + 1);
    completeRefresh(event);
  }

  async open(n: AppNotification): Promise<void> {
    if (!n.read_at) {
      try {
        await this.api.post(`notifications/${n.id}/read`);
        this.items.set(this.items().map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
        void this.notifications.refresh();
      } catch {
        /* not critical */
      }
    }
    // Personnel and admins go to the work order; reporters to their report.
    if (n.work_order_id && !this.auth.isReporter()) {
      await this.router.navigate(['/work-orders', n.work_order_id]);
    } else if (n.report_id && !this.auth.isMaintenance()) {
      await this.router.navigate(['/reports', n.report_id]);
    }
  }

  async markAll(): Promise<void> {
    try {
      await this.api.post('notifications/read-all');
      const now = new Date().toISOString();
      this.items.set(this.items().map((i) => ({ ...i, read_at: i.read_at ?? now })));
      this.notifications.unread.set(0);
    } catch (err) {
      await this.ui.error(err);
    }
  }

  private async fetch(page: number): Promise<void> {
    try {
      const res = await this.api.get<Paginated<AppNotification>>('notifications', { page });
      this.items.set(page === 1 ? res.data : [...this.items(), ...res.data]);
      this.page.set(res.current_page);
      this.lastPage.set(res.last_page);
    } catch (err) {
      await this.ui.error(err);
    }
  }
}
