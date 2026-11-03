import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IONIC } from '../../shared/ionic';

type Role = 'student' | 'faculty' | 'staff';

/** Password rules shown under the form; the backend checks the same rules. */
const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'Include uppercase and lowercase letters', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'Include a number', test: (p) => /\d/.test(p) },
  { label: 'Include a special character (e.g., @, #, !)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/**
 * Sign-up screen. Same layout as the login screen:
 * campus photo panel on the left (on top on phones), the form card on the right.
 */
@Component({
  selector: 'app-register',
  imports: [...IONIC, FormsModule, RouterLink],
  template: `
    <ion-content class="auth lg rg">
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

        <!-- Sign-up card -->
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
            <div class="rg-badge" aria-hidden="true"><ion-icon name="person-add-outline" /></div>
            <h1>Create Your Account</h1>
            <p class="lg-sub">For students, faculty, and staff. Use your school email.</p>

            <form (ngSubmit)="submit()" novalidate>
              <span class="auth-label">I am a</span>
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

              <label class="auth-label" for="reg-name">Full Name</label>
              <div class="auth-field">
                <ion-icon name="person-outline" />
                <input id="reg-name" name="name" autocomplete="name" placeholder="Juan Dela Cruz" [(ngModel)]="form.name" />
              </div>

              <label class="auth-label" for="reg-id">{{ form.role === 'student' ? 'Student ID' : 'Employee ID' }}</label>
              <div class="auth-field">
                <ion-icon name="id-card-outline" />
                <input
                  id="reg-id"
                  name="id_number"
                  [placeholder]="form.role === 'student' ? 'e.g. 2024-00123' : 'e.g. EMP-0123'"
                  [(ngModel)]="form.id_number"
                />
              </div>

              <label class="auth-label" for="reg-email">School Email</label>
              <div class="auth-field">
                <ion-icon name="mail-outline" />
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

              <label class="auth-label" for="reg-password">Password</label>
              <div class="auth-field">
                <ion-icon name="lock-closed-outline" />
                <input
                  id="reg-password"
                  [type]="showPassword() ? 'text' : 'password'"
                  name="password"
                  autocomplete="new-password"
                  placeholder="At least 8 characters"
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

              <label class="auth-label" for="reg-confirm">Confirm Password</label>
              <div class="auth-field">
                <ion-icon name="lock-closed-outline" />
                <input
                  id="reg-confirm"
                  [type]="showConfirm() ? 'text' : 'password'"
                  name="password_confirmation"
                  autocomplete="new-password"
                  placeholder="Re-enter your password"
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

            <p class="rg-foot"><span>Already have an account? <a routerLink="/login">Sign In</a></span></p>
          </div>
        </section>
      </div>
    </ion-content>
  `,
})
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);

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

  async submit(): Promise<void> {
    const f = this.form;
    if (!f.name.trim() || !f.email.trim() || !f.password) {
      this.error.set('Enter your full name, school email and password.');
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
