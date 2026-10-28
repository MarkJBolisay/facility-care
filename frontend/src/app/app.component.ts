import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { AuthService } from './core/auth.service';
import { NotificationService } from './core/notification.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    // Start the unread-notification poller and refresh the cached profile.
    inject(NotificationService);
    void inject(AuthService).refresh().catch(() => undefined);
  }
}
