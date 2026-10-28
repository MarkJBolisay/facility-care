import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Report } from '../../core/models';
import { NotificationService } from '../../core/notification.service';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

interface ReporterDashboard {
  reports: { total: number; pending: number; approved: number; in_progress: number; completed: number; rejected: number };
  recent_reports: Report[];
}

@Component({
  selector: 'app-reporter-home',
  imports: [...IONIC, ...SHARED, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>FacilityCare</ion-title>
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

        <ion-button expand="block" size="large" routerLink="/tabs/new-report">
          <ion-icon slot="start" name="camera-outline" />
          Report a facility issue
        </ion-button>

        @if (data(); as d) {
          <div class="section-title">My reports</div>
          <div class="stat-grid">
            <app-stat label="Pending" [value]="d.reports.pending" icon="time-outline" color="warning" />
            <app-stat label="Approved" [value]="d.reports.approved" icon="flag-outline" color="tertiary" />
            <app-stat label="In progress" [value]="d.reports.in_progress" icon="construct-outline" color="primary" />
            <app-stat label="Completed" [value]="d.reports.completed" icon="checkmark-circle-outline" color="success" />
          </div>

          <div class="section-title">
            Recent
            <a routerLink="/tabs/my-reports">View all</a>
          </div>
          <ion-list class="cards">
            @for (r of d.recent_reports; track r.id) {
              <ion-item button detail [routerLink]="['/reports', r.id]">
                <ion-label>
                  <h3>{{ r.title }}</h3>
                  <p>{{ r.reference }} · {{ r.created_at | ago }}</p>
                  <div class="pills"><app-badge kind="status" [value]="r.status" /></div>
                </ion-label>
              </ion-item>
            } @empty {
              <app-empty text="You haven't reported anything yet." />
            }
          </ion-list>
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
