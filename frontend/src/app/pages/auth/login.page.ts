import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IONIC } from '../../shared/ionic';
import { AuthLogoComponent } from './auth-logo';

@Component({
  selector: 'app-login',
  imports: [...IONIC, FormsModule, RouterLink, AuthLogoComponent],
  template: `
    <ion-content class="auth" [scrollY]="true">
      <div class="auth-login">
        <header class="auth-hero">
          <app-auth-logo [size]="112" />
          <h1>FacilityCare</h1>
          <p>School facility reporting &amp; maintenance</p>
          <span class="auth-campus">NEUST · PAPAYA OFF-CAMPUS</span>
        </header>

        <section class="auth-sheet">
          <h2>Welcome back</h2>
          <p class="auth-sub">Sign in to report or track a facility issue.</p>

          <form (ngSubmit)="submit()" novalidate>
            <label class="auth-label" for="login-email">Email</label>
            <div class="auth-field">
              <ion-icon name="mail-outline" />
              <input
                id="login-email"
                type="email"
                name="email"
                autocomplete="email"
                inputmode="email"
                placeholder="you@school.edu"
                [(ngModel)]="email"
              />
            </div>

            <div class="auth-label-row">
              <label class="auth-label" for="login-password">Password</label>
              <button type="button" class="auth-link" (click)="forgot()">Forgot password?</button>
            </div>
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
                <ion-icon [name]="showPassword() ? 'eye-off-outline' : 'eye-outline'" />
              </button>
            </div>

            @if (error()) {
              <p class="auth-error" role="alert">{{ error() }}</p>
            }

            <button type="submit" class="auth-btn" [disabled]="loading()">
              @if (loading()) {
                <ion-spinner name="crescent" />
              } @else {
                Sign in <ion-icon name="arrow-forward-outline" />
              }
            </button>
          </form>

          <p class="auth-foot">
            Student, faculty or staff without an account?<br />
            <a routerLink="/register">Create one</a>
          </p>
        </section>
      </div>
    </ion-content>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);

  email = '';
  password = '';
  protected showPassword = signal(false);
  protected loading = signal(false);
  protected error = signal('');

  async forgot(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Forgot password?',
      message:
        'Please visit or message the campus facility office. An administrator can reset your password, and you can change it later in your profile.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  async submit(): Promise<void> {
    if (!this.email.trim() || !this.password) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const user = await this.auth.login(this.email.trim(), this.password);
      this.password = '';
      this.showPassword.set(false);
      await this.router.navigateByUrl(this.auth.homeUrl(user.role), { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
