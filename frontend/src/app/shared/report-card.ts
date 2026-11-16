import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { Report } from '../core/models';

/** How each report status looks to a student / faculty / staff member. */
export const REPORTER_STATUS: Record<string, { label: string; icon: string; tone: string }> = {
  pending: { label: 'Pending', icon: 'time-outline', tone: 'warning' },
  approved: { label: 'Approved', icon: 'flag-outline', tone: 'primary' },
  in_progress: { label: 'In Progress', icon: 'build-outline', tone: 'primary' },
  completed: { label: 'Resolved', icon: 'checkmark-circle', tone: 'success' },
  rejected: { label: 'Not Approved', icon: 'close-circle-outline', tone: 'danger' },
};

/** Status pill used on the report cards and the review step. */
@Component({
  selector: 'app-status-pill',
  imports: [IonIcon],
  template: `<span class="rp-pill" [class]="'rp-pill rp-tone-' + info().tone"><ion-icon [name]="info().icon" />{{ info().label }}</span>`,
})
export class StatusPillComponent {
  readonly status = input.required<string>();
  protected info = computed(() => REPORTER_STATUS[this.status()] ?? { label: this.status(), icon: 'ellipse-outline', tone: 'muted' });
}

/** One report in the "My Reports" / "Recent Reports" lists: photo, title, place, date and status. */
@Component({
  selector: 'app-report-card',
  imports: [IonIcon, RouterLink, DatePipe, StatusPillComponent],
  template: `
    @let r = report();
    <a class="rp-card" [routerLink]="['/reports', r.id]">
      <div class="rp-thumb">
        @if (r.photo_url) {
          <img [src]="r.photo_url" alt="" loading="lazy" />
        } @else {
          <ion-icon name="image-outline" />
        }
      </div>
      <div class="rp-card-main">
        <strong>{{ r.title }}</strong>
        <span class="rp-card-loc">{{ place() }}</span>
        <span class="rp-card-date"><ion-icon name="calendar-outline" />{{ r.created_at | date: 'MMM d, y • h:mm a' }}</span>
        <app-status-pill [status]="r.status" />
        @if (r.status === 'completed' && !r.confirmed_at) {
          <span class="rp-pill rp-tone-warning"><ion-icon name="help-circle-outline" />Please confirm the fix</span>
        }
      </div>
      <ion-icon name="chevron-forward-outline" class="rp-chev" />
    </a>
  `,
})
export class ReportCardComponent {
  readonly report = input.required<Report>();
  /** "Building › Room", plus the place typed under "Others" if any. */
  protected place = computed(() => {
    const r = this.report();
    const parts = [r.facility?.full_name, r.location_details].filter((p) => !!p?.trim());
    return parts.join(' – ') || 'No location';
  });
}
