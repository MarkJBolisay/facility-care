import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Report, labelOf } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { UiService } from '../../core/ui.service';
import { DashHeroComponent } from '../../shared/dash';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

interface ReporterDashboard {
  reports: { total: number; pending: number; approved: number; in_progress: number; completed: number; rejected: number };
  active_reports: Report[];
  recent_closed: Report[];
}

const STEPS = ['Submitted', 'Approved', 'Repairing', 'Done'];
const STEP_OF: Record<string, number> = { pending: 0, approved: 1, in_progress: 2, completed: 3 };

/** Home screen for students, faculty and staff. */
@Component({
  selector: 'app-reporter-home',
  imports: [...IONIC, ...SHARED, RouterLink, DashHeroComponent],
  template: `
    <ion-content class="dash">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>

      <app-dash-hero [subtitle]="roleLabel() + ' · NEUST Papaya Off-Campus'">
        <h1>Something broken on campus?<br />Let us know.</h1>
      </app-dash-hero>

      <div class="dash-body">
        <a class="dash-cta" routerLink="/tabs/new-report">
          <div class="dash-cta-icon"><ion-icon name="camera-outline" /></div>
          <div class="dash-cta-text">
            <strong>Report a facility issue</strong>
            <span>Take a photo and tell us where it is</span>
          </div>
          <ion-icon name="chevron-forward-outline" />
        </a>

        @if (data(); as d) {
          <div class="dash-section">
            <h2>My reports</h2>
            <a routerLink="/tabs/my-reports" [queryParams]="{ status: '' }">View all ({{ d.reports.total }})</a>
          </div>
          <div class="dash-card dash-summary">
            <a class="dash-metric warning" routerLink="/tabs/my-reports" [queryParams]="{ status: 'pending' }">
              <strong>{{ d.reports.pending }}</strong><span>Pending</span>
            </a>
            <a class="dash-metric tertiary" routerLink="/tabs/my-reports" [queryParams]="{ status: 'approved' }">
              <strong>{{ d.reports.approved }}</strong><span>Approved</span>
            </a>
            <a class="dash-metric primary" routerLink="/tabs/my-reports" [queryParams]="{ status: 'in_progress' }">
              <strong>{{ d.reports.in_progress }}</strong><span>Repairing</span>
            </a>
            <a class="dash-metric success" routerLink="/tabs/my-reports" [queryParams]="{ status: 'completed' }">
              <strong>{{ d.reports.completed }}</strong><span>Fixed</span>
            </a>
          </div>

          <div class="dash-section"><h2>Track your reports</h2></div>
          <div class="dash-list">
            @for (r of d.active_reports; track r.id) {
              <a class="dash-card dash-track" [routerLink]="['/reports', r.id]">
                <div class="dash-track-head">
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
                      <ion-icon name="location-outline" />
                      <span>{{ r.facility?.full_name || r.location_details || 'No location' }}</span>
                    </div>
                    <div class="dash-item-meta">{{ r.reference }} · {{ r.created_at | ago }}</div>
                  </div>
                  <ion-icon name="chevron-forward-outline" class="chev" />
                </div>
                <div class="dash-steps">
                  @for (s of steps; track s; let i = $index) {
                    <div class="dash-step" [class.done]="i < stepOf(r)" [class.now]="i === stepOf(r)">
                      <i></i>{{ s }}
                    </div>
                  }
                </div>
                <div class="dash-track-note">
                  <ion-icon name="information-circle-outline" />
                  <span>{{ note(r) }}</span>
                </div>
              </a>
            } @empty {
              <div class="dash-card dash-empty">
                <ion-icon name="checkmark-circle-outline" />
                You have no open reports. If you see something broken, report it above.
              </div>
            }
          </div>

          @if (d.recent_closed.length) {
            <div class="dash-section">
              <h2>Recently closed</h2>
              <a routerLink="/tabs/my-reports" [queryParams]="{ status: 'completed' }">See all</a>
            </div>
            <div class="dash-list">
              @for (r of d.recent_closed; track r.id) {
                <a class="dash-item" [routerLink]="['/reports', r.id]">
                  <div class="dash-thumb" [class.tint-success]="r.status === 'completed'" [class.tint-danger]="r.status !== 'completed'">
                    <ion-icon [name]="r.status === 'completed' ? 'checkmark-done-outline' : 'close-circle-outline'" />
                  </div>
                  <div class="dash-item-main">
                    <span class="dash-item-title">{{ r.title }}</span>
                    <div class="dash-item-meta">
                      <span>{{ r.status === 'completed' ? 'Fixed' : 'Not approved' }} · {{ r.updated_at | ago }}</span>
                    </div>
                  </div>
                  <ion-icon name="chevron-forward-outline" class="chev" />
                </a>
              }
            </div>
          }
        } @else {
          <div class="dash-section"><h2>My reports</h2></div>
          <ion-skeleton-text animated class="dash-skeleton" />
          <ion-skeleton-text animated class="dash-skeleton" style="height: 150px; margin-top: 12px" />
        }
      </div>
    </ion-content>
  `,
})
export class ReporterHomePage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  protected auth = inject(AuthService);
  protected notifications = inject(NotificationService);
  protected data = signal<ReporterDashboard | null>(null);
  protected readonly steps = STEPS;

  protected roleLabel(): string {
    return labelOf('role', this.auth.user()?.role);
  }

  protected stepOf(r: Report): number {
    return STEP_OF[r.status] ?? 0;
  }

  /** One line explaining where the report is now. */
  protected note(r: Report): string {
    const who = r.active_work_order?.assignee?.name;
    switch (r.status) {
      case 'pending':
        return 'Waiting for the facility office to review your report.';
      case 'approved':
        return who ? `Approved. ${who} will work on it soon.` : 'Approved. A maintenance staff will be assigned.';
      case 'in_progress':
        return who ? `${who} is repairing it now.` : 'The repair is in progress.';
      default:
        return labelOf('status', r.status);
    }
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(event?: Event): Promise<void> {
    try {
      this.data.set(await this.api.get<ReporterDashboard>('dashboard'));
      void this.notifications.refresh();
    } catch (err) {
      await this.ui.error(err);
    } finally {
      completeRefresh(event);
    }
  }
}
