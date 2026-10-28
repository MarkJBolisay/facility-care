import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { Report, User, labelOf, toneOf } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { DashHeroComponent, initials } from '../../shared/dash';
import { IONIC } from '../../shared/ionic';
import { BarItem, SHARED, TrendPoint, completeRefresh } from '../../shared/ui';

interface AdminDashboard {
  reports: { total: number; today: number; pending: number; approved: number; in_progress: number; completed: number; rejected: number };
  work_orders: { pending: number; in_progress: number; completed: number; unassigned: number; overdue: number };
  open_by_priority: Record<string, number>;
  open_by_category: Record<string, number>;
  trend: TrendPoint[];
  personnel: (User & { active_count: number })[];
  recent_reports: Report[];
}

/** Home screen for administrators. */
@Component({
  selector: 'app-admin-dashboard',
  imports: [...IONIC, ...SHARED, RouterLink, DatePipe, DashHeroComponent],
  template: `
    <ion-content class="dash">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>

      <app-dash-hero [subtitle]="(today | date: 'EEEE, MMMM d') + ' · Administrator'">
        @if (data(); as d) {
          <h1>
            @if (d.reports.today) {
              {{ d.reports.today }} new {{ d.reports.today === 1 ? 'report' : 'reports' }} today
            } @else {
              No new reports today
            }
          </h1>
        }
      </app-dash-hero>

      <div class="dash-body">
        @if (data(); as d) {
          <!-- Totals -->
          <div class="dash-card">
            <div class="dash-summary" style="--cols: 3">
              <a class="dash-metric warning" routerLink="/tabs/reports" [queryParams]="{ status: 'pending' }">
                <strong>{{ d.reports.pending }}</strong><span>Pending</span>
              </a>
              <a class="dash-metric primary" routerLink="/tabs/reports" [queryParams]="{ status: 'in_progress' }">
                <strong>{{ d.reports.in_progress }}</strong><span>In progress</span>
              </a>
              <a class="dash-metric success" routerLink="/tabs/reports" [queryParams]="{ status: 'completed' }">
                <strong>{{ d.reports.completed }}</strong><span>Completed</span>
              </a>
            </div>
            <div class="dash-summary-foot">
              <span><strong>{{ d.reports.total }}</strong> total reports · {{ resolvedRate() }}% resolved</span>
              <a class="dash-link" routerLink="/tabs/reports" [queryParams]="{ status: '' }">All reports</a>
            </div>
          </div>

          <!-- Needs attention -->
          <div class="dash-section"><h2>Needs your attention</h2></div>
          @if (d.reports.pending || d.work_orders.unassigned || d.work_orders.overdue) {
            <div class="dash-tiles">
              <a class="dash-tile" [class.zero]="!d.reports.pending" routerLink="/tabs/reports" [queryParams]="{ status: 'pending' }">
                <span class="dash-tile-icon tint-warning"><ion-icon name="document-text-outline" /></span>
                <strong>{{ d.reports.pending }}</strong>
                <span>To review</span>
              </a>
              <a class="dash-tile" [class.zero]="!d.work_orders.unassigned" routerLink="/tabs/work-orders" [queryParams]="{ attention: 'unassigned', status: '' }">
                <span class="dash-tile-icon tint-tertiary"><ion-icon name="person-add-outline" /></span>
                <strong>{{ d.work_orders.unassigned }}</strong>
                <span>To assign</span>
              </a>
              <a class="dash-tile" [class.zero]="!d.work_orders.overdue" routerLink="/tabs/work-orders" [queryParams]="{ attention: 'overdue', status: '' }">
                <span class="dash-tile-icon tint-danger"><ion-icon name="warning-outline" /></span>
                <strong>{{ d.work_orders.overdue }}</strong>
                <span>Overdue</span>
              </a>
            </div>
          } @else {
            <div class="dash-card dash-empty">
              <ion-icon name="checkmark-done-outline" />
              All caught up. Nothing is waiting for you.
            </div>
          }

          <!-- Quick actions -->
          <div class="dash-section"><h2>Quick actions</h2></div>
          <div class="dash-card dash-actions">
            <a class="dash-action" routerLink="/work-orders/new">
              <span class="dash-tile-icon tint-primary"><ion-icon name="hammer-outline" /></span>New work order
            </a>
            <a class="dash-action" routerLink="/facilities/new">
              <span class="dash-tile-icon tint-success"><ion-icon name="business-outline" /></span>Add facility
            </a>
            <a class="dash-action" routerLink="/notifications/send">
              <span class="dash-tile-icon tint-warning"><ion-icon name="megaphone-outline" /></span>Send notice
            </a>
            <a class="dash-action" routerLink="/analytics">
              <span class="dash-tile-icon tint-tertiary"><ion-icon name="bar-chart-outline" /></span>Analytics
            </a>
          </div>

          <!-- Trend -->
          <div class="dash-section">
            <h2>Last 6 months</h2>
            <a routerLink="/analytics">Full report</a>
          </div>
          <div class="dash-card dash-panel"><app-trend [points]="d.trend" /></div>

          <!-- Open issues -->
          <div class="dash-section"><h2>Open issues</h2></div>
          <div class="dash-card dash-panel">
            <ion-segment [value]="breakdown()" (ionChange)="setBreakdown($event)">
              <ion-segment-button value="priority"><ion-label>By priority</ion-label></ion-segment-button>
              <ion-segment-button value="category"><ion-label>By category</ion-label></ion-segment-button>
            </ion-segment>
            <app-bars [items]="breakdown() === 'priority' ? priorityBars() : categoryBars()" />
          </div>

          <!-- Team -->
          <div class="dash-section">
            <h2>Maintenance team</h2>
            <a routerLink="/users">Manage</a>
          </div>
          <div class="dash-card dash-panel" style="padding-top: 4px; padding-bottom: 4px">
            @for (p of d.personnel; track p.id) {
              <div class="dash-person">
                <div class="dash-person-avatar">{{ initialsOf(p.name) }}<i [class.on]="p.is_available"></i></div>
                <div class="dash-person-main">
                  <strong>{{ p.name }}</strong>
                  <span>{{ p.specialization | label: 'category' }} · {{ p.is_available ? 'Available' : 'Not available' }}</span>
                </div>
                <div class="dash-load">
                  <b>{{ p.active_count }}</b> active
                  <div class="dash-load-track"><div [style.width.%]="loadPct(p.active_count)"></div></div>
                </div>
              </div>
            } @empty {
              <div class="dash-empty">No maintenance personnel yet.</div>
            }
          </div>

          <!-- Recent -->
          <div class="dash-section">
            <h2>Recent reports</h2>
            <a routerLink="/tabs/reports" [queryParams]="{ status: '' }">View all</a>
          </div>
          <div class="dash-list">
            @for (r of d.recent_reports; track r.id) {
              <a class="dash-item" [routerLink]="['/reports', r.id]">
                <div class="dash-thumb">
                  @if (r.photo_url) {
                    <img [src]="r.photo_url" alt="" loading="lazy" />
                  } @else {
                    <ion-icon name="document-text-outline" />
                  }
                </div>
                <div class="dash-item-main">
                  <span class="dash-item-title">{{ r.title }}</span>
                  <div class="dash-item-meta">
                    <span>{{ r.facility?.full_name || r.location_details || 'No location' }}</span>
                  </div>
                  <div class="dash-item-meta">
                    <span>{{ r.reporter?.name }} · {{ r.created_at | ago }}</span>
                  </div>
                  <div class="pills">
                    <app-badge kind="status" [value]="r.status" />
                    @if (r.priority) {
                      <app-badge kind="priority" [value]="r.priority" />
                    }
                  </div>
                </div>
                <ion-icon name="chevron-forward-outline" class="chev" />
              </a>
            }
          </div>
        } @else {
          <ion-skeleton-text animated class="dash-skeleton" style="height: 110px" />
          <ion-skeleton-text animated class="dash-skeleton" style="height: 110px; margin-top: 16px" />
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

  protected readonly today = new Date();
  protected data = signal<AdminDashboard | null>(null);
  protected breakdown = signal<'priority' | 'category'>('priority');
  protected readonly initialsOf = initials;

  protected resolvedRate = computed(() => {
    const r = this.data()?.reports;
    return r?.total ? Math.round((r.completed / r.total) * 100) : 0;
  });

  private maxLoad = computed(() => Math.max(1, ...(this.data()?.personnel ?? []).map((p) => p.active_count)));

  protected loadPct(n: number): number {
    return (n / this.maxLoad()) * 100;
  }

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

  setBreakdown(event: Event): void {
    const v = (event as CustomEvent<{ value: string }>).detail.value;
    this.breakdown.set(v === 'category' ? 'category' : 'priority');
  }

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
