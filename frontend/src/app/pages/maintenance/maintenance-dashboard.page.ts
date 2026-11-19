import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { WorkOrder, REPAIR_STAGES, STAGE_ORDER, labelOf, toneOf } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { UiService } from '../../core/ui.service';
import { DashHeroComponent } from '../../shared/dash';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

interface MaintenanceDashboard {
  tasks: { pending: number; in_progress: number; nearing_completion: number; completed_this_month: number; completed_total: number; overdue: number };
  is_available: boolean;
  next_tasks: WorkOrder[];
}

/** Home screen for maintenance personnel. */
@Component({
  selector: 'app-maintenance-dashboard',
  imports: [...IONIC, ...SHARED, RouterLink, DatePipe, DashHeroComponent],
  template: `
    <ion-content class="dash">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>

      <app-dash-hero [subtitle]="subtitle()">
        <div class="dash-avail">
          <span class="dash-avail-dot" [class.on]="available()"></span>
          <div class="dash-avail-text">
            <strong>{{ available() ? 'Available for new tasks' : 'Not available' }}</strong>
            <span>The admin sees this when assigning repairs.</span>
          </div>
          <ion-toggle
            [checked]="available()"
            [disabled]="saving()"
            (ionChange)="toggleAvailable($event)"
            aria-label="Available for new tasks"
          />
        </div>
      </app-dash-hero>

      <div class="dash-body">
        @if (data(); as d) {
          <!-- laptop: two columns (theme/staff.scss); phone: one column -->
          <div class="dash-cols">
          <div class="dash-col">
          <div class="dash-card">
            <div class="dash-summary">
              <a class="dash-metric warning" routerLink="/tabs/tasks">
                <span class="dash-metric-icon tint-warning"><ion-icon name="list-outline" /></span>
                <strong>{{ d.tasks.pending }}</strong><span>To do</span>
              </a>
              <a class="dash-metric primary" routerLink="/tabs/tasks">
                <span class="dash-metric-icon tint-primary"><ion-icon name="construct-outline" /></span>
                <strong>{{ d.tasks.in_progress + d.tasks.nearing_completion }}</strong><span>In progress</span>
              </a>
              <a class="dash-metric danger" routerLink="/tabs/tasks">
                <span class="dash-metric-icon tint-danger"><ion-icon name="warning-outline" /></span>
                <strong>{{ d.tasks.overdue }}</strong><span>Overdue</span>
              </a>
              <a class="dash-metric success" routerLink="/tabs/history">
                <span class="dash-metric-icon tint-success"><ion-icon name="checkmark-done-outline" /></span>
                <strong>{{ d.tasks.completed_this_month }}</strong><span>Done this month</span>
              </a>
            </div>
            <div class="dash-summary-foot">
              <span><strong>{{ d.tasks.completed_total }}</strong> repairs completed in total</span>
              <a class="dash-link" routerLink="/tabs/history">History</a>
            </div>
          </div>

          @if (current(); as w) {
            <div class="dash-section"><h2>{{ w.status === 'in_progress' || w.status === 'nearing_completion' ? 'Current job' : 'Next job' }}</h2></div>
            <a class="dash-card dash-job" [routerLink]="['/work-orders', w.id]">
              @if (w.report?.photo_url) {
                <div class="dash-job-photo"><img [src]="w.report.photo_url" alt="Photo of the issue" /></div>
              }
              <div class="dash-job-body">
                <div class="pills">
                  <app-badge kind="status" [value]="w.status" />
                  <app-badge kind="priority" [value]="w.priority" />
                  @if (w.type === 'preventive') { <ion-badge color="tertiary" class="pill">Preventive</ion-badge> }
                </div>
                <h3>{{ w.title }}</h3>
                <div class="dash-job-meta">
                  <span><ion-icon name="location-outline" />{{ w.facility?.full_name || 'No location' }}</span>
                  @if (w.equipment) {
                    <span><ion-icon name="desktop-outline" />{{ w.equipment.name }} ({{ w.equipment.code }})</span>
                  }
                  @if (w.due_date) {
                    <span [class.overdue]="isOverdue(w)">
                      <ion-icon name="calendar-outline" />
                      {{ isOverdue(w) ? 'Overdue · was due' : 'Due' }} {{ w.due_date | date: 'MMM d' }}
                    </span>
                  }
                </div>
                @if (nextStep(w); as s) {
                  <div class="dash-progress">
                    <div class="dash-progress-bar"><div [style.width.%]="(s.n - 1) * 25"></div></div>
                    <span>Step {{ s.n }} of 5 · <strong>{{ s.label }}</strong></span>
                  </div>
                }
                <span class="dash-btn">
                  {{ w.status === 'pending' ? 'Start repair' : w.status === 'in_progress' ? 'Continue repair' : 'Finish repair' }}
                  <ion-icon name="arrow-forward-outline" />
                </span>
              </div>
            </a>
          }

          </div>
          <div class="dash-col">
          <div class="dash-section">
            <h2>Up next</h2>
            <a routerLink="/tabs/tasks">All tasks</a>
          </div>
          <div class="dash-list">
            @for (w of upNext(); track w.id) {
              <a class="dash-item" [routerLink]="['/work-orders', w.id]">
                <span class="dash-stripe" [style.background]="'var(--ion-color-' + priorityTone(w) + ')'"></span>
                <div class="dash-item-main">
                  <span class="dash-item-title">{{ w.title }}</span>
                  <div class="dash-item-meta">
                    <ion-icon name="location-outline" /><span>{{ w.facility?.full_name || 'No location' }}</span>
                  </div>
                  @if (w.equipment || w.type === 'preventive') {
                    <div class="dash-item-meta">
                      <ion-icon [name]="w.type === 'preventive' ? 'calendar-outline' : 'desktop-outline'" />
                      <span>{{ w.type === 'preventive' ? 'Preventive · ' : '' }}{{ w.equipment?.name || '' }}</span>
                    </div>
                  }
                  <div class="dash-item-meta" [class.overdue]="isOverdue(w)">
                    <ion-icon name="flag-outline" /><span>{{ priorityLabel(w) }}</span>
                    @if (w.due_date) {
                      <span>· {{ isOverdue(w) ? 'Overdue' : 'Due' }} {{ w.due_date | date: 'MMM d' }}</span>
                    }
                  </div>
                </div>
                @if (w.status === 'pending') {
                  <button type="button" class="dash-mini-btn" (click)="start(w, $event)">Start</button>
                } @else {
                  <ion-icon name="chevron-forward-outline" class="chev" />
                }
              </a>
            } @empty {
              @if (!current()) {
                <div class="dash-card dash-empty">
                  <ion-icon name="checkmark-done-outline" />
                  No assigned tasks right now. New tasks will show up here.
                </div>
              } @else {
                <div class="dash-card dash-empty" style="padding: 16px">Nothing else in your queue.</div>
              }
            }
          </div>
          </div>
          </div>
        } @else {
          <ion-skeleton-text animated class="dash-skeleton" />
          <ion-skeleton-text animated class="dash-skeleton" style="height: 220px; margin-top: 16px" />
        }
      </div>
    </ion-content>
  `,
})
export class MaintenanceDashboardPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  protected auth = inject(AuthService);
  protected notifications = inject(NotificationService);

  protected data = signal<MaintenanceDashboard | null>(null);
  protected available = signal(true);
  protected saving = signal(false);

  /** The task to focus on: the first one in progress, otherwise the most urgent one. */
  protected current = computed(() => this.data()?.next_tasks[0] ?? null);
  protected upNext = computed(() => this.data()?.next_tasks.slice(1) ?? []);

  protected subtitle = computed(() => {
    const spec = this.auth.user()?.specialization;
    return 'Maintenance' + (spec ? ' · ' + labelOf('category', spec) : '');
  });

  /** Which of the five stages this job is at (1 = reported, 5 = completed). */
  protected nextStep(w: WorkOrder): { n: number; label: string } {
    const index = STAGE_ORDER[w.status] ?? 1;
    return { n: index + 1, label: REPAIR_STAGES[index]?.label ?? '' };
  }

  protected isOverdue(w: WorkOrder): boolean {
    return !!w.due_date && w.due_date < new Date().toISOString().slice(0, 10);
  }

  protected priorityTone(w: WorkOrder): string {
    return toneOf('priority', w.priority);
  }

  protected priorityLabel(w: WorkOrder): string {
    return labelOf('priority', w.priority) + ' priority';
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(event?: Event): Promise<void> {
    try {
      const d = await this.api.get<MaintenanceDashboard>('dashboard');
      this.data.set(d);
      this.available.set(d.is_available);
      void this.notifications.refresh();
    } catch (err) {
      await this.ui.error(err);
    } finally {
      completeRefresh(event);
    }
  }

  /** Open the job: the stage form there takes the photo proof before moving on. */
  async start(w: WorkOrder, event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    await this.router.navigate(['/work-orders', w.id]);
  }

  async toggleAvailable(event: Event): Promise<void> {
    const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked;
    const user = this.auth.user();
    if (!user || this.available() === checked) return;
    this.saving.set(true);
    try {
      const updated = await this.api.put<typeof user>('me', { ...user, is_available: checked });
      this.auth.setUser(updated);
      this.available.set(checked);
      await this.ui.toast(checked ? 'You are now available for new tasks.' : 'You are marked as not available.');
    } catch (err) {
      this.available.set(!checked);
      await this.ui.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
