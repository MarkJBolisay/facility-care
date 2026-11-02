import { Component, inject } from '@angular/core';
import { IonBadge, IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';

/** Bottom tab bar. Which tabs appear depends on the signed-in user's role. */
@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        @if (auth.isAdmin()) {
          <ion-tab-button tab="dashboard">
            <ion-icon name="grid-outline" /><ion-label>Dashboard</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="reports">
            <ion-icon name="document-text-outline" /><ion-label>Requests</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="work-orders">
            <ion-icon name="hammer-outline" /><ion-label>Work Orders</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="equipment">
            <ion-icon name="desktop-outline" /><ion-label>Equipment</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="more">
            <ion-icon name="ellipsis-horizontal-outline" /><ion-label>More</ion-label>
            @if (notifications.unread()) {
              <ion-badge color="danger">{{ notifications.unread() }}</ion-badge>
            }
          </ion-tab-button>
        } @else if (auth.isMaintenance()) {
          <ion-tab-button tab="home">
            <ion-icon name="grid-outline" /><ion-label>Dashboard</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="tasks">
            <ion-icon name="hammer-outline" /><ion-label>My Tasks</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="history">
            <ion-icon name="time-outline" /><ion-label>History</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="alerts">
            <ion-icon name="notifications-outline" /><ion-label>Alerts</ion-label>
            @if (notifications.unread()) {
              <ion-badge color="danger">{{ notifications.unread() }}</ion-badge>
            }
          </ion-tab-button>
          <ion-tab-button tab="profile">
            <ion-icon name="person-circle-outline" /><ion-label>Profile</ion-label>
          </ion-tab-button>
        } @else {
          <ion-tab-button tab="my-home">
            <ion-icon name="home-outline" /><ion-label>Home</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="my-reports">
            <ion-icon name="document-text-outline" /><ion-label>My Reports</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="new-report">
            <ion-icon name="add-circle-outline" /><ion-label>Report</ion-label>
          </ion-tab-button>
          <ion-tab-button tab="alerts">
            <ion-icon name="notifications-outline" /><ion-label>Alerts</ion-label>
            @if (notifications.unread()) {
              <ion-badge color="danger">{{ notifications.unread() }}</ion-badge>
            }
          </ion-tab-button>
          <ion-tab-button tab="profile">
            <ion-icon name="person-circle-outline" /><ion-label>Profile</ion-label>
          </ion-tab-button>
        }
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {
  protected auth = inject(AuthService);
  protected notifications = inject(NotificationService);
}
