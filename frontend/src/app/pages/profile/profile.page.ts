import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { User } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';
import { CapitalizeDirective } from '../../shared/capitalize';

@Component({
  selector: 'app-profile',
  imports: [...IONIC, ...SHARED, FormsModule, CapitalizeDirective],
  template: `
    <ion-header>
      <ion-toolbar>
        @if (!inTabs) {
          <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        }
        <ion-title>Profile</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding page">
      @if (ready()) {
        <div class="max">
          <div class="panel">
            <strong>{{ auth.user()?.name }}</strong>
            <div class="small muted">{{ auth.user()?.role | label: 'role' }}</div>
          </div>

          <div class="section-title">Details</div>
          <div class="panel">
            <ion-list lines="full">
              <ion-item><ion-input label="Name" labelPlacement="stacked" appCapitalize [(ngModel)]="form.name" /></ion-item>
              <ion-item><ion-input label="Email" labelPlacement="stacked" type="email" [(ngModel)]="form.email" /></ion-item>
              <ion-item><ion-input label="Phone" labelPlacement="stacked" type="tel" [(ngModel)]="form.phone" /></ion-item>
              <ion-item><ion-input label="Department" labelPlacement="stacked" [(ngModel)]="form.department" /></ion-item>
              @if (auth.isMaintenance()) {
                <ion-item><ion-toggle [(ngModel)]="form.is_available">Available for new tasks</ion-toggle></ion-item>
              }
            </ion-list>
            <ion-button expand="block" (click)="save()">Save</ion-button>
          </div>

          <div class="section-title">Change password</div>
          <div class="panel">
            <ion-list lines="full">
              <ion-item><ion-input label="Current password" labelPlacement="stacked" type="password" [(ngModel)]="pw.current_password" /></ion-item>
              <ion-item><ion-input label="New password" labelPlacement="stacked" type="password" [(ngModel)]="pw.password" /></ion-item>
              <ion-item><ion-input label="Confirm new password" labelPlacement="stacked" type="password" [(ngModel)]="pw.password_confirmation" /></ion-item>
            </ion-list>
            <ion-button expand="block" fill="outline" (click)="changePassword()">Update password</ion-button>
          </div>

          <ion-button expand="block" fill="clear" color="danger" (click)="logout()">
            <ion-icon slot="start" name="log-out-outline" /> Sign out
          </ion-button>
        </div>
      }
    </ion-content>
  `,
})
export class ProfilePage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  protected auth = inject(AuthService);
  protected inTabs = inject(Router).url.startsWith('/tabs');
  protected ready = signal(false);
  private cdr = inject(ChangeDetectorRef);

  form = { name: '', email: '', phone: '', department: '', is_available: true };
  pw = { current_password: '', password: '', password_confirmation: '' };

  ionViewWillEnter(): void {
    const u = this.auth.user();
    if (u) {
      this.form = {
        name: u.name,
        email: u.email,
        phone: u.phone ?? '',
        department: u.department ?? '',
        is_available: u.is_available,
      };
    }
    this.ready.set(true);
    this.cdr.markForCheck();
  }

  async save(): Promise<void> {
    const user = await this.ui.busy(() => this.api.put<User>('me', this.form));
    if (user) {
      this.auth.setUser(user);
      await this.ui.toast('Profile saved.', 'success');
    }
  }

  async changePassword(): Promise<void> {
    const ok = await this.ui.busy(() => this.api.put('me/password', this.pw).then(() => true));
    if (ok) {
      this.pw = { current_password: '', password: '', password_confirmation: '' };
      this.cdr.markForCheck();
      await this.ui.toast('Password updated.', 'success');
    }
  }

  async logout(): Promise<void> {
    if (await this.ui.confirm('Sign out', 'Do you want to sign out?', 'Sign out')) {
      await this.auth.logout();
    }
  }
}
