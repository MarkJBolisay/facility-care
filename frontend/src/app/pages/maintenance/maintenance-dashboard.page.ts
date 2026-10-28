import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { WorkOrder } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

interface MaintenanceDashboard {
  tasks: { pending: number; in_progress: number; completed_this_month: number; completed_total: number; overdue: number };
  is_available: boolean;
  next_tasks: WorkOrder[];
}

@Component({
  selector: 'app-maintenance-dashboard',
  imports: [...IONIC, ...SHARED, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Dashboard</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/tabs/alerts">
            <ion-icon slot="icon-only" name="notifications-outline" />
            @if (notifications.unread()) {
              <ion-badge color="danger">{{ notifications.unread() }}</ion-badge>
            }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        <p class="muted mt-0">Hello, {{ auth.user()?.name }}</p>

        @if (data(); as d) {
          <div class="panel">
            <ion-toggle [checked]="d.is_available" (ionChange)="toggleAvailable($event)" justify="space-between">
              <strong>Available for new tasks</strong>
              <div class="small muted">The admin sees this when assigning repairs.</div>
            </ion-toggle>
          </div>

          <div class="stat-grid">
            <app-stat label="Pending" [value]="d.tasks.pending" icon="time-outline" color="warning" />
            <app-stat label="In progress" [value]="d.tasks.in_progress" icon="construct-outline" color="primary" />
            <app-stat label="Done this month" [value]="d.tasks.completed_this_month" icon="checkmark-circle-outline" color="success" />
            <app-stat label="Overdue" [value]="d.tasks.overdue" icon="warning-outline" color="danger" />
          </div>

          <div class="section-title">
            Up next
            <a routerLink="/tabs/tasks">All tasks</a>
          </div>
          <ion-list class="cards">
            @for (w of d.next_tasks; track w.id) {
              <ion-item button detail [routerLink]="['/work-orders', w.id]">
                @if (w.report?.photo_url) {
                  <ion-thumbnail slot="start"><img [src]="w.report.photo_url" alt="" /></ion-thumbnail>
                }
                <ion-label>
                  <h3>{{ w.title }}</h3>
                  <p><ion-icon name="location-outline" /> {{ w.facility?.full_name || 'No location' }}</p>
                  @if (w.due_date) {
                    <p><ion-icon name="calendar-outline" /> Due {{ w.due_date }}</p>
                  }
                  <div class="pills">
                    <app-badge kind="status" [value]="w.status" />
                    <app-badge kind="priority" [value]="w.priority" />
                  </div>
                </ion-label>
              </ion-item>
            } @empty {
              <app-empty text="No assigned tasks right now." icon="checkmark-done-outline" />
            }
          </ion-list>

          <p class="muted small ion-text-center">{{ d.tasks.completed_total }} repairs completed in total</p>
        } @else {
          <div class="stat-grid">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="stat"><ion-skeleton-text animated style="height: 56px" /></div>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class MaintenanceDashboardPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  protected auth = inject(AuthService);
  protected notifications = inject(NotificationService);
  protected data = signal<MaintenanceDashboard | null>(null);

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(event?: Event): Promise<void> {
    try {
      this.data.set(await this.api.get<MaintenanceDashboard>('dashboard'));
      void this.notifications.refresh();
    } catch (err) {
      await this.ui.error(err);
    } finally {
      completeRefresh(event);
    }
  }

  async toggleAvailable(event: Event): Promise<void> {
    const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked;
    const user = this.auth.user();
    if (!user || user.is_available === checked) return;
    try {
      const updated = await this.api.put<typeof user>('me', { ...user, is_available: checked });
      this.auth.setUser(updated);
      await this.ui.toast(checked ? 'You are now available.' : 'You are marked unavailable.');
    } catch (err) {
      await this.ui.error(err);
    }
  }
}
