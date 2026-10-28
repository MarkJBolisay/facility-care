import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';

/** Admin menu for the screens that don't fit in the tab bar. */
@Component({
  selector: 'app-more',
  imports: [...IONIC, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>More</ion-title></ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding page">
      <div class="max">
        <div class="panel">
          <strong>{{ auth.user()?.name }}</strong>
          <div class="small muted">{{ auth.user()?.email }} · Administrator</div>
        </div>

        <div class="section-title">Management</div>
        <ion-list class="cards">
          <ion-item button detail routerLink="/analytics">
            <ion-icon slot="start" name="bar-chart-outline" color="primary" />
            <ion-label><h3>Reports &amp; Analytics</h3><p>Monthly, quarterly, yearly and custom reports</p></ion-label>
          </ion-item>
          <ion-item button detail routerLink="/users">
            <ion-icon slot="start" name="people-outline" color="tertiary" />
            <ion-label><h3>User Management</h3><p>Students, faculty, staff and maintenance accounts</p></ion-label>
          </ion-item>
          <ion-item button detail routerLink="/notifications/send">
            <ion-icon slot="start" name="megaphone-outline" color="warning" />
            <ion-label><h3>Notification Management</h3><p>Send updates about repair requests</p></ion-label>
          </ion-item>
          <ion-item button detail routerLink="/notifications">
            <ion-icon slot="start" name="notifications-outline" color="success" />
            <ion-label><h3>My notifications</h3></ion-label>
            @if (notifications.unread()) {
              <ion-badge slot="end" color="danger">{{ notifications.unread() }}</ion-badge>
            }
          </ion-item>
        </ion-list>

        <div class="section-title">Account</div>
        <ion-list class="cards">
          <ion-item button detail routerLink="/profile">
            <ion-icon slot="start" name="person-circle-outline" />
            <ion-label>Profile &amp; password</ion-label>
          </ion-item>
          <ion-item button (click)="logout()">
            <ion-icon slot="start" name="log-out-outline" color="danger" />
            <ion-label color="danger">Sign out</ion-label>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  `,
})
export class MorePage {
  protected auth = inject(AuthService);
  protected notifications = inject(NotificationService);
  private ui = inject(UiService);

  async logout(): Promise<void> {
    if (await this.ui.confirm('Sign out', 'Do you want to sign out?', 'Sign out')) {
      await this.auth.logout();
    }
  }
}
