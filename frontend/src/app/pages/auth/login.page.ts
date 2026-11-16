import { HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertController, LoadingController } from '@ionic/angular';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { apiHost } from '../../core/server';
import { openServerDialog } from '../../core/server-dialog';

import { IONIC } from '../../shared/ionic';

/**
 * Sign-in screen.
 * Full-screen campus photo behind a white login card (blue + yellow swooshes in its corners).
 * The card is centered on the screen (phone, tablet and laptop).
 * Styles: the "lx" section at the end of theme/login.scss.
 */
@Component({
  selector: 'app-login',
  imports: [...IONIC, FormsModule, RouterLink],
  template: `
    <ion-content class="auth lx">
      <!-- Full-screen campus photo -->
      <div class="lx-photo" aria-hidden="true"></div>

      <div class="lx-wrap">
        <!-- Login card -->
        <div class="lx-card">
          <!-- blue + yellow corner swooshes -->
          <svg class="lx-swoosh lx-swoosh-tl" viewBox="0 0 200 140" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,0 L200,0 C130,6 70,30 34,72 C16,94 6,116 0,140 Z" fill="#1d5fd8" />
            <path d="M200,0 C130,6 70,30 34,72 C16,94 6,116 0,140 L0,128 C8,104 20,84 38,64 C76,24 132,4 200,0 Z" fill="#f5c518" />
          </svg>
          <svg class="lx-swoosh lx-swoosh-br" viewBox="0 0 200 140" preserveAspectRatio="none" aria-hidden="true">
            <path d="M200,140 L0,140 C70,134 130,110 166,68 C184,46 194,24 200,0 Z" fill="#1d5fd8" />
            <path d="M0,140 C70,134 130,110 166,68 C184,46 194,24 200,0 L200,14 C192,38 180,58 162,78 C124,118 68,136 0,140 Z" fill="#f5c518" />
          </svg>

          <div class="lx-brand">
            <img class="lx-logo" src="assets/neust-logo.png" alt="FacilityCare NEUST Papaya logo" />
            <div class="lx-wordmark"><span>Facility</span><span>Care</span></div>
            <div class="lx-campus">NEUST PAPAYA OFF-CAMPUS</div>
          </div>

          <h1>Welcome Back!</h1>
          <p class="lx-sub">Log in to your account to continue.</p>

          <form (ngSubmit)="submit()" novalidate>
            <label class="lx-label" for="login-email"><ion-icon name="mail" /> Email Address</label>
            <div class="auth-field">
              <input
                  id="login-email"
                  type="email"
                  name="email"
                  autocomplete="email"
                  inputmode="email"
                  placeholder="Enter your email address"
                [(ngModel)]="email"
              />
            </div>

            <label class="lx-label" for="login-password"><ion-icon name="lock-closed" /> Password</label>
            <div class="auth-field">
              <input
                id="login-password"
                [type]="showPassword() ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                placeholder="Enter your password"
                [(ngModel)]="password"
              />
              <button
                type="button"
                class="auth-eye"
                [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                (click)="showPassword.set(!showPassword())"
              >
                <ion-icon [name]="showPassword() ? 'eye-outline' : 'eye-off-outline'" />
              </button>
            </div>

            <div class="lx-row">
              <label class="lx-check">
                <input type="checkbox" name="remember" [(ngModel)]="remember" />
                <span>Remember me</span>
              </label>
              <button type="button" class="lx-link" (click)="forgot()">Forgot password?</button>
            </div>

            @if (error()) {
              <p class="auth-error" role="alert">{{ error() }}</p>
            }

            <button type="submit" class="auth-btn" [disabled]="loading()">
              @if (loading()) {
                <ion-spinner name="crescent" />
              } @else {
                <ion-icon name="log-in-outline" /> Log In
              }
            </button>
          </form>

          <p class="lx-foot">Don't have an account? <a routerLink="/register">Sign up here</a></p>
          @if (showServer) {
            <button type="button" class="lx-server" (click)="changeServer()">
              <ion-icon name="server-outline" aria-hidden="true" /> Server: {{ serverHost() }} <span>Change</span>
            </button>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);

  email = this.auth.lastEmail;
  password = '';
  // unchecked by default (like the design); stays checked if it was used last time
  remember = !!this.auth.lastEmail;
  protected showPassword = signal(false);
  protected loading = signal(false);
  protected error = signal('');
  private http = inject(HttpClient);
  private loadingCtrl = inject(LoadingController);
  /** "Server" link: only in the phone app (the browser version runs next to the backend). */
  protected readonly showServer = Capacitor.isNativePlatform();
  protected serverHost = signal(apiHost());

  /** Change the backend address (the laptop's IP) without rebuilding the APK. */
  async changeServer(): Promise<void> {
    if (await openServerDialog(this.alertCtrl, this.loadingCtrl, this.http)) {
      this.serverHost.set(apiHost());
      this.error.set('');
    }
  }


  async forgot(): Promise<void> {
    await this.message(
      'Forgot password?',
      'Please visit or message the campus facility office. An administrator can reset your password, and you can change it later in your profile.',
    );
  }

  async submit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const user = await this.auth.login(this.email.trim(), this.password, this.remember);
      this.password = '';
      this.showPassword.set(false);
      await this.router.navigateByUrl(this.auth.homeUrl(user.role), { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  private async message(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({ header, message, buttons: ['OK'] });
    await alert.present();
  }
}
