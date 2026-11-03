import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Report, labelOf } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { UiService } from '../../core/ui.service';
import { greeting } from '../../shared/dash';
import { IONIC } from '../../shared/ionic';
import { ReportCardComponent } from '../../shared/report-card';
import { completeRefresh } from '../../shared/ui';

interface ReporterDashboard {
  reports: { total: number; pending: number; approved: number; in_progress: number; completed: number; rejected: number };
  recent_reports: Report[];
}

const ROLE_ICON: Record<string, string> = {
  student: 'school-outline',
  faculty: 'people-outline',
  staff: 'briefcase-outline',
};

/**
 * Home screen for students, faculty and staff.
 * Phone: one column. Laptop (900px+): "Report" button and counts on the left, recent reports on the right.
 */
@Component({
  selector: 'app-reporter-home',
  imports: [...IONIC, RouterLink, ReportCardComponent],
  template: `
    <ion-content class="rp">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>

      <header class="rp-hero">
        <div class="rp-hero-photo" aria-hidden="true"></div>
        <div class="rp-hero-in">
          <div class="rp-hero-top">
            <img class="rp-hero-logo" src="assets/neust-logo.png" alt="" />
            <div class="rp-hero-brand">
              <div class="rp-hero-word"><span>Facility</span><span>Care</span></div>
              <small>NEUST Papaya Off-Campus</small>
            </div>
            <a class="rp-bell" routerLink="/tabs/alerts" [attr.aria-label]="'Notifications, ' + notifications.unread() + ' unread'">
              <ion-icon name="notifications-outline" />
              @if (notifications.unread()) {
                <span>{{ notifications.unread() > 9 ? '9+' : notifications.unread() }}</span>
              }
            </a>
          </div>
          <p class="rp-hello">{{ hello }},</p>
          <h1 class="rp-name">{{ firstName() }}! <span aria-hidden="true">👋</span></h1>
          <span class="rp-role"><ion-icon [name]="roleIcon()" />{{ roleLabel() }}</span>
        </div>
        <svg class="rp-hero-wave" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,22 C260,62 560,0 1000,30 L1000,60 L0,60 Z" fill="#f5c518" />
          <path d="M0,34 C260,74 560,12 1000,42 L1000,60 L0,60 Z" class="rp-hero-wave-fill" />
        </svg>
      </header>

      <div class="rp-home">
        <div class="rp-home-col">
          <a class="rp-cta" routerLink="/reports/new">
            <span class="rp-cta-icon"><ion-icon name="camera-outline" /></span>
            <span class="rp-cta-text">
              <strong>Report a Facility Issue</strong>
              <span>Take a photo, describe the issue, and submit a report</span>
            </span>
            <ion-icon name="chevron-forward-outline" class="rp-cta-chev" />
          </a>

          <div class="rp-sec">
            <h2>My Reports</h2>
            <a routerLink="/tabs/my-reports" [queryParams]="{ status: '' }">View All</a>
          </div>
          <div class="rp-stats">
            <a class="rp-stat" routerLink="/tabs/my-reports" [queryParams]="{ status: 'pending' }">
              <span class="rp-stat-icon rp-tone-warning"><ion-icon name="time-outline" /></span>
              <strong class="rp-text-warning">{{ counts().pending }}</strong>
              <span>Pending</span>
            </a>
            <a class="rp-stat" routerLink="/tabs/my-reports" [queryParams]="{ status: 'approved,in_progress' }">
              <span class="rp-stat-icon rp-tone-primary"><ion-icon name="build-outline" /></span>
              <strong class="rp-text-primary">{{ counts().inProgress }}</strong>
              <span>In Progress</span>
            </a>
            <a class="rp-stat" routerLink="/tabs/my-reports" [queryParams]="{ status: 'completed' }">
              <span class="rp-stat-icon rp-tone-tertiary"><ion-icon name="checkmark-circle-outline" /></span>
              <strong class="rp-text-tertiary">{{ counts().resolved }}</strong>
              <span>Resolved</span>
            </a>
          </div>
        </div>

        <div class="rp-home-col">
          <div class="rp-sec"><h2>Recent Reports</h2></div>
          @if (data(); as d) {
            <div class="rp-list">
              @for (r of d.recent_reports; track r.id) {
                <app-report-card [report]="r" />
              } @empty {
                <div class="rp-empty">
                  <ion-icon name="document-text-outline" />
                  <strong>No reports yet</strong>
                  <span>Your reported issues will appear here.</span>
                </div>
              }
            </div>
          } @else {
            <ion-skeleton-text animated class="rp-skeleton" />
            <ion-skeleton-text animated class="rp-skeleton" />
          }
        </div>
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
  protected readonly hello = greeting();

  protected firstName = computed(() => (this.auth.user()?.name ?? '').trim().split(/\s+/)[0] ?? '');
  protected roleLabel = computed(() => labelOf('role', this.auth.user()?.role));
  protected roleIcon = computed(() => ROLE_ICON[this.auth.user()?.role ?? ''] ?? 'person-outline');
  /** The three numbers on the home screen: approved counts as "In Progress" for the reporter. */
  protected counts = computed(() => {
    const r = this.data()?.reports;
    return {
      pending: r?.pending ?? 0,
      inProgress: (r?.approved ?? 0) + (r?.in_progress ?? 0),
      resolved: r?.completed ?? 0,
    };
  });

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
