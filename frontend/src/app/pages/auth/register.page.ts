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
import { CapitalizeDirective } from '../../shared/capitalize';

type Role = 'student' | 'faculty' | 'staff';

/** Password rules shown under the form; the backend checks the same rules. */
const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'Include uppercase and lowercase letters', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'Include a number', test: (p) => /\d/.test(p) },
  { label: 'Include a special character (e.g., @, #, !)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** Student ID: "PPY" + year + "-" + 5 digits, e.g. PPY2023-00249 (same check as the backend). */
const STUDENT_ID = /^PPY\d{4}-\d{5}$/;

/**
 * Sign-up screen. Same design as the login screen: full-screen campus photo
 * behind a centered white card with blue + yellow corner swooshes.
 * Styles: the "lx" section at the end of theme/login.scss ("lxr" = sign-up only).
 */
@Component({
  selector: 'app-register',
  imports: [...IONIC, FormsModule, RouterLink, CapitalizeDirective],
  template: `
    <ion-content class="auth lx lxr">
      <!-- Full-screen campus photo -->
      <div class="lx-photo" aria-hidden="true"></div>

      <div class="lx-wrap">
        <!-- Sign-up card -->
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

          <h1>Create Your Account</h1>
          <p class="lx-sub">For students, faculty, and staff. Use your school email.</p>

          <form (ngSubmit)="submit()" novalidate>
            <span class="lx-label">I am a</span>
            <div class="rg-roles" role="radiogroup" aria-label="I am a">
              @for (r of roles; track r.value) {
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="form.role === r.value"
                  [class.active]="form.role === r.value"
                  (click)="form.role = r.value"
                >
                  <ion-icon [name]="r.icon" /> {{ r.label }}
                </button>
              }
            </div>

            <div class="rg-pair">
            <div>
            <label class="lx-label" for="reg-name"><ion-icon name="person" /> Full Name</label>
            <div class="auth-field">
              <input id="reg-name" appCapitalize name="name" autocomplete="name" placeholder="Juan Dela Cruz" [(ngModel)]="form.name" />
            </div>
            </div>

            <div>
            <label class="lx-label" for="reg-id"><ion-icon name="id-card" /> {{ form.role === 'student' ? 'Student ID' : 'Employee ID' }}</label>
            <div class="auth-field">
              <input
                id="reg-id"
                name="id_number"
                [placeholder]="form.role === 'student' ? 'e.g. PPY2023-00249' : 'e.g. EMP-0123'"
                [attr.maxlength]="form.role === 'student' ? 13 : 50"
                autocapitalize="characters"
                [ngModel]="form.id_number"
                (ngModelChange)="setId($event)"
              />
            </div>
            </div>
            </div>

            <label class="lx-label" for="reg-email"><ion-icon name="mail" /> School Email</label>
            <div class="auth-field">
              <input
                id="reg-email"
                type="email"
                name="email"
                autocomplete="email"
                inputmode="email"
                placeholder="you@neust.edu.ph"
                [(ngModel)]="form.email"
              />
            </div>

            <div class="rg-pair">
            <div>
            <label class="lx-label" for="reg-password"><ion-icon name="lock-closed" /> Password</label>
            <div class="auth-field">
              <input
                id="reg-password"
                [type]="showPassword() ? 'text' : 'password'"
                name="password"
                autocomplete="new-password"
                placeholder="Min. 8 characters"
                [(ngModel)]="form.password"
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
            </div>

            <div>
            <label class="lx-label" for="reg-confirm"><ion-icon name="lock-closed" /> Confirm Password</label>
            <div class="auth-field">
              <input
                id="reg-confirm"
                [type]="showConfirm() ? 'text' : 'password'"
                name="password_confirmation"
                autocomplete="new-password"
                placeholder="Re-enter password"
                [(ngModel)]="form.password_confirmation"
              />
              <button
                type="button"
                class="auth-eye"
                [attr.aria-label]="showConfirm() ? 'Hide password' : 'Show password'"
                (click)="showConfirm.set(!showConfirm())"
              >
                <ion-icon [name]="showConfirm() ? 'eye-outline' : 'eye-off-outline'" />
              </button>
            </div>
            </div>
            </div>

            <div class="rg-rules">
              <ion-icon class="rg-shield" name="shield-checkmark" aria-hidden="true" />
              <div>
                <strong>Password Requirements:</strong>
                <ul>
                  @for (rule of rules; track rule.label) {
                    <li [class.ok]="rule.test(form.password)">
                      <ion-icon name="checkmark-outline" aria-hidden="true" />{{ rule.label }}
                    </li>
                  }
                </ul>
              </div>
            </div>

            @if (error()) {
              <p class="auth-error" role="alert">{{ error() }}</p>
            }

            <button type="submit" class="auth-btn" [disabled]="loading()">
              @if (loading()) {
                <ion-spinner name="crescent" />
              } @else {
                <ion-icon name="person-add-outline" /> Create Account
              }
            </button>
          </form>

          <p class="lx-foot">Already have an account? <a routerLink="/login">Log in here</a></p>
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
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private alertCtrl = inject(AlertController);

  protected readonly roles: { value: Role; label: string; icon: string }[] = [
    { value: 'student', label: 'Student', icon: 'school-outline' },
    { value: 'faculty', label: 'Faculty', icon: 'people-outline' },
    { value: 'staff', label: 'Staff', icon: 'briefcase-outline' },
  ];
  protected readonly rules = RULES;

  form = {
    role: 'student' as Role,
    name: '',
    id_number: '',
    email: '',
    password: '',
    password_confirmation: '',
  };
  protected showPassword = signal(false);
  protected showConfirm = signal(false);
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


  /** Student IDs are typed in capitals: "ppy2023-00249" becomes "PPY2023-00249". */
  protected setId(value: string): void {
    this.form.id_number = this.form.role === 'student' ? (value ?? '').toUpperCase() : value;
  }

  async submit(): Promise<void> {
    const f = this.form;
    if (!f.name.trim() || !f.email.trim() || !f.password) {
      this.error.set('Enter your full name, school email and password.');
      return;
    }
    if (f.role === 'student' && !STUDENT_ID.test(f.id_number.trim())) {
      this.error.set('Enter your Student ID like PPY2023-00249.');
      return;
    }
    const missing = RULES.find((r) => !r.test(f.password));
    if (missing) {
      this.error.set(`Password must meet all requirements: ${missing.label.toLowerCase()}.`);
      return;
    }
    if (f.password !== f.password_confirmation) {
      this.error.set('Passwords do not match.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const user = await this.auth.register({
        ...f,
        name: f.name.trim(),
        email: f.email.trim(),
        id_number: f.id_number.trim() || null,
      });
      await this.router.navigateByUrl(this.auth.homeUrl(user.role), { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
