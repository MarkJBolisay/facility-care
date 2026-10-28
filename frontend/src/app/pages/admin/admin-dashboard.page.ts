import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { Report, User, labelOf, toneOf } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { BarItem, SHARED, TrendPoint, completeRefresh } from '../../shared/ui';

interface AdminDashboard {
  reports: { total: number; pending: number; approved: number; in_progress: number; completed: number; rejected: number };
  work_orders: { pending: number; in_progress: number; completed: number; unassigned: number; overdue: number };
  open_by_priority: Record<string, number>;
  open_by_category: Record<string, number>;
  trend: TrendPoint[];
  personnel: (User & { active_count: number })[];
  recent_reports: Report[];
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [...IONIC, ...SHARED, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Dashboard</ion-title>
        <ion-buttons slot="end">
          <ion-button routerLink="/notifications">
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
          <div class="stat-grid">
            <app-stat label="Total reports" [value]="d.reports.total" icon="document-text-outline" color="tertiary" routerLink="/tabs/reports" />
            <app-stat label="Pending review" [value]="d.reports.pending" icon="time-outline" color="warning" />
            <app-stat label="In progress" [value]="d.reports.in_progress" icon="construct-outline" color="primary" />
            <app-stat label="Completed" [value]="d.reports.completed" icon="checkmark-circle-outline" color="success" />
          </div>

          @if (d.reports.pending || d.work_orders.unassigned || d.work_orders.overdue) {
            <div class="section-title">Needs attention</div>
            <ion-list class="cards">
              @if (d.reports.pending) {
                <ion-item button detail routerLink="/tabs/reports" [queryParams]="{ status: 'pending' }">
                  <ion-icon slot="start" name="alert-circle-outline" color="warning" />
                  <ion-label>{{ d.reports.pending }} report(s) waiting for review</ion-label>
                </ion-item>
              }
              @if (d.work_orders.unassigned) {
                <ion-item button detail routerLink="/tabs/work-orders">
                  <ion-icon slot="start" name="person-add-outline" color="tertiary" />
                  <ion-label>{{ d.work_orders.unassigned }} work order(s) without personnel</ion-label>
                </ion-item>
              }
              @if (d.work_orders.overdue) {
                <ion-item button detail routerLink="/tabs/work-orders">
                  <ion-icon slot="start" name="warning-outline" color="danger" />
                  <ion-label>{{ d.work_orders.overdue }} overdue work order(s)</ion-label>
                </ion-item>
              }
            </ion-list>
          }

          <div class="section-title">Last 6 months</div>
          <div class="panel"><app-trend [points]="d.trend" /></div>

          <div class="section-title">Open issues by priority</div>
          <div class="panel"><app-bars [items]="priorityBars()" /></div>

          <div class="section-title">Open issues by category</div>
          <div class="panel"><app-bars [items]="categoryBars()" /></div>

          <div class="section-title">Maintenance personnel workload</div>
          <ion-list class="cards">
            @for (p of d.personnel; track p.id) {
              <ion-item>
                <ion-icon slot="start" name="person-outline" />
                <ion-label>
                  <h3>{{ p.name }}</h3>
                  <p>{{ p.specialization | label: 'category' }} · {{ p.is_available ? 'Available' : 'Unavailable' }}</p>
                </ion-label>
                <ion-badge slot="end" [color]="p.active_count ? 'primary' : 'medium'">{{ p.active_count }} active</ion-badge>
              </ion-item>
            }
          </ion-list>

          <div class="section-title">
            Recent reports
            <a routerLink="/tabs/reports">View all</a>
          </div>
          <ion-list class="cards">
            @for (r of d.recent_reports; track r.id) {
              <ion-item button detail [routerLink]="['/reports', r.id]">
                <ion-label>
                  <h3>{{ r.title }}</h3>
                  <p>{{ r.facility?.full_name || r.location_details || 'No location' }} · {{ r.created_at | ago }}</p>
                  <div class="pills">
                    <app-badge kind="status" [value]="r.status" />
                    @if (r.priority) {
                      <app-badge kind="priority" [value]="r.priority" />
                    }
                  </div>
                </ion-label>
              </ion-item>
            }
          </ion-list>
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
export class AdminDashboardPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  protected auth = inject(AuthService);
  protected notifications = inject(NotificationService);

  protected data = signal<AdminDashboard | null>(null);

  protected priorityBars = computed<BarItem[]>(() => {
    const p = this.data()?.open_by_priority ?? {};
    return ['critical', 'high', 'medium', 'low', 'unset']
      .filter((k) => p[k])
      .map((k) => ({ label: labelOf('priority', k === 'unset' ? null : k), value: p[k], color: toneOf('priority', k) }));
  });

  protected categoryBars = computed<BarItem[]>(() =>
    Object.entries(this.data()?.open_by_category ?? {}).map(([k, v]) => ({
      label: labelOf('category', k === 'uncategorized' ? null : k),
      value: v,
    })),
  );

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(event?: Event): Promise<void> {
    try {
      this.data.set(await this.api.get<AdminDashboard>('dashboard'));
      void this.notifications.refresh();
    } catch (err) {
      await this.ui.error(err);
    } finally {
      completeRefresh(event);
    }
  }
}
