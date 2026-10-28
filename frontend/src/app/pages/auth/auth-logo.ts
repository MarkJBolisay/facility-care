import { Component, input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';

/**
 * Campus seal shown on the login and register screens.
 * Put the logo at src/assets/neust-logo.png; until then an icon is shown.
 */
@Component({
  selector: 'app-auth-logo',
  imports: [IonIcon],
  template: `
    <div class="auth-seal" [style.width.px]="size()" [style.height.px]="size()">
      @if (ok()) {
        <img src="assets/neust-logo.png" alt="FacilityCare NEUST Papaya logo" (error)="ok.set(false)" />
      } @else {
        <ion-icon name="school-outline" [style.font-size.px]="size() * 0.5" />
      }
    </div>
  `,
})
export class AuthLogoComponent {
  readonly size = input(88);
  protected ok = signal(true);
}
