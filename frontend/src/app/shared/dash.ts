import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';

/** Initials for an avatar: "Juan Dela Cruz" → "JD". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** "Good morning" / "Good afternoon" / "Good evening" for the current time. */
export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Header used at the top of every dashboard, in the same style as the login screen:
 * campus photo with a navy-blue overlay, logo + FacilityCare name, greeting, bell and avatar.
 * Anything placed inside it (a headline, a toggle) is shown below the greeting.
 */
@Component({
  selector: 'app-dash-hero',
  imports: [IonIcon, RouterLink],
  template: `
    <header class="dash-hero">
      <div class="dash-hero-photo" aria-hidden="true"></div>
      <div class="dash-hero-inner">
        <div class="dash-topbar">
          <div class="dash-brand">
            <img src="assets/neust-logo.png" alt="" />
            <div>
              <div class="dash-wordmark"><span>Facility</span><span>Care</span></div>
              <div class="dash-campus">NEUST PAPAYA OFF-CAMPUS</div>
            </div>
          </div>
          <a class="dash-bell" [routerLink]="alertsLink()" [attr.aria-label]="'Notifications, ' + notifications.unread() + ' unread'">
            <ion-icon name="notifications-outline" />
            @if (notifications.unread()) {
              <span class="dash-bell-badge">{{ notifications.unread() > 9 ? '9+' : notifications.unread() }}</span>
            }
          </a>
          <a class="dash-avatar" [routerLink]="profileLink()" aria-label="My profile">{{ userInitials() }}</a>
        </div>

        <div class="dash-hello">
          <span>{{ hello }},</span>
          <strong>{{ firstName() }}</strong>
        </div>
        @if (subtitle()) {
          <div class="dash-chip"><i></i>{{ subtitle() }}</div>
        }
        <ng-content />
      </div>
      <svg class="dash-wave" viewBox="0 0 1000 80" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,34 C220,74 470,6 700,30 C840,45 930,40 1000,26 L1000,80 L0,80 Z" fill="#f5c518" />
        <path d="M0,46 C220,86 470,18 700,42 C840,57 930,52 1000,38 L1000,80 L0,80 Z" class="dash-wave-fill" />
      </svg>
    </header>
  `,
})
export class DashHeroComponent {
  protected auth = inject(AuthService);
  protected notifications = inject(NotificationService);

  readonly subtitle = input('');
  protected readonly hello = greeting();

  protected firstName = computed(() => (this.auth.user()?.name ?? '').trim().split(/\s+/)[0] ?? '');
  protected userInitials = computed(() => initials(this.auth.user()?.name));
  protected profileLink = computed(() => (this.auth.isAdmin() ? '/profile' : '/tabs/profile'));
  protected alertsLink = computed(() => (this.auth.isAdmin() ? '/notifications' : '/tabs/alerts'));
}
