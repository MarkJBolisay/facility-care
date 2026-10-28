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
 * Blue header used at the top of every dashboard: avatar, greeting, bell.
 * Anything placed inside it (a call to action, a toggle) is shown below the greeting.
 */
@Component({
  selector: 'app-dash-hero',
  imports: [IonIcon, RouterLink],
  template: `
    <header class="dash-hero">
      <div class="dash-hero-top">
        <a class="dash-avatar" [routerLink]="profileLink()" aria-label="My profile">{{ userInitials() }}</a>
        <div class="dash-hello">
          <span>{{ hello }},</span>
          <strong>{{ firstName() }}</strong>
        </div>
        <a class="dash-bell" [routerLink]="alertsLink()" [attr.aria-label]="'Notifications, ' + notifications.unread() + ' unread'">
          <ion-icon name="notifications-outline" />
          @if (notifications.unread()) {
            <span class="dash-bell-badge">{{ notifications.unread() > 9 ? '9+' : notifications.unread() }}</span>
          }
        </a>
      </div>
      @if (subtitle()) {
        <p class="dash-sub">{{ subtitle() }}</p>
      }
      <ng-content />
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
