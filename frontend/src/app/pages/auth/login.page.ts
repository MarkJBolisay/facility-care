import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IONIC } from '../../shared/ionic';

/**
 * Sign-in screen.
 * Phone: campus photo with the logo on top, the login card below.
 * Tablet / desktop (900px+): campus photo panel on the left (with the blue and yellow waves), login card on the right.
 */
@Component({
  selector: 'app-login',
  imports: [...IONIC, FormsModule, RouterLink],
  template: `
    <ion-content class="auth lg">
      <div class="lg-wrap">
        <!-- Campus photo panel -->
        <section class="lg-hero">
          <div class="lg-photo" aria-hidden="true"></div>
          <div class="lg-hero-inner">
            <div class="lg-brand">
              <img class="lg-logo" src="assets/neust-logo.png" alt="FacilityCare NEUST Papaya logo" />
              <div class="lg-brand-text">
                <div class="lg-wordmark"><span>Facility</span><span>Care</span></div>
                <p class="lg-tagline">Mobile-Based School Facility Reporting and Maintenance System</p>
                <div class="lg-campus"><i></i>NEUST PAPAYA OFF-CAMPUS</div>
              </div>
            </div>
          </div>
        </section>

        <!-- Login card -->
        <section class="lg-side">
          <svg class="lg-swoosh lg-swoosh-top" viewBox="0 0 300 220" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,0 L300,0 C220,10 120,40 60,110 C30,145 12,185 0,220 Z" fill="#1d5fd8" />
            <path d="M0,0 L190,0 C120,20 60,60 30,120 C18,145 8,170 0,195 Z" fill="#0b2a6f" opacity="0.9" />
            <path d="M300,0 C220,10 120,40 60,110 C30,145 12,185 0,220 L0,236 C14,196 34,154 66,118 C128,48 226,16 300,8 Z" fill="#f5c518" />
          </svg>
          <svg class="lg-swoosh lg-swoosh-right" viewBox="0 0 120 600" preserveAspectRatio="none" aria-hidden="true">
            <path d="M120,0 L120,600 L0,600 C60,520 90,420 100,300 C108,190 112,90 120,0 Z" fill="#1d5fd8" />
            <path d="M120,40 C112,130 108,220 100,320 C92,430 66,520 18,600 L4,600 C54,518 82,428 90,320 C98,214 104,124 114,34 Z" fill="#f5c518" />
          </svg>
          <div class="lg-card">
            <div class="lg-card-brand">
              <img class="lg-logo" src="assets/neust-logo.png" alt="" />
              <div class="lg-wordmark"><span>Facility</span><span>Care</span></div>
              <div class="lg-campus-center">NEUST PAPAYA OFF-CAMPUS</div>
            </div>

            <h1>Welcome Back!</h1>
            <p class="lg-sub">Log in to your account to continue.</p>

            <form (ngSubmit)="submit()" novalidate>
              <label class="auth-label" for="login-email">Email Address</label>
              <div class="auth-field">
                <ion-icon name="mail-outline" />
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

              <label class="auth-label" for="login-password">Password</label>
              <div class="auth-field">
                <ion-icon name="lock-closed-outline" />
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

              <div class="lg-row">
                <label class="lg-check">
                  <input type="checkbox" name="remember" [(ngModel)]="remember" />
                  <span>Remember me</span>
                </label>
                <button type="button" class="auth-link" (click)="forgot()">Forgot password?</button>
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

            <div class="lg-or"><span>or</span></div>

            <button type="button" class="lg-google" (click)="google()">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              Continue with Google
            </button>

            <p class="lg-foot">Don't have an account? <a routerLink="/register">Sign up here</a></p>
          </div>

        </section>
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

  async forgot(): Promise<void> {
    await this.message(
      'Forgot password?',
      'Please visit or message the campus facility office. An administrator can reset your password, and you can change it later in your profile.',
    );
  }

  /** Google sign-in needs a Google Cloud client ID before it can work. */
  async google(): Promise<void> {
    await this.message(
      'Google sign-in',
      'Signing in with Google is not available yet. Please log in with your school email and password.',
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
