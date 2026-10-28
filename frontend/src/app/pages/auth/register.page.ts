import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IONIC } from '../../shared/ionic';
import { AuthLogoComponent } from './auth-logo';

type Role = 'student' | 'faculty' | 'staff';

@Component({
  selector: 'app-register',
  imports: [...IONIC, FormsModule, RouterLink, AuthLogoComponent],
  template: `
    <ion-content class="auth">
      <div class="auth-register">
        <div class="auth-topbar">
          <button type="button" class="auth-back" aria-label="Back to sign in" (click)="back()">
            <ion-icon name="arrow-back-outline" />
          </button>
          <div class="auth-campus-mini">
            <div>
              <strong>NEUST</strong>
              <span>Papaya Off-Campus</span>
            </div>
            <app-auth-logo [size]="44" />
          </div>
        </div>

        <h2>Create your account</h2>
        <p class="auth-sub">For students, faculty and staff. Use your school email.</p>

        <form (ngSubmit)="submit()" novalidate>
          <span class="auth-label">I am a</span>
          <div class="auth-roles" role="radiogroup" aria-label="I am a">
            @for (r of roles; track r.value) {
              <button
                type="button"
                role="radio"
                [attr.aria-checked]="form.role === r.value"
                [class.active]="form.role === r.value"
                (click)="form.role = r.value"
              >
                {{ r.label }}
              </button>
            }
          </div>

          <label class="auth-label" for="reg-name">Full name</label>
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

          <label class="auth-label" for="reg-email">School email</label>
          <div class="auth-field">
            <ion-icon name="mail-outline" />
            <input
              id="reg-email"
              type="email"
              name="email"
              autocomplete="email"
              inputmode="email"
              placeholder="you@school.edu"
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
              <ion-icon [name]="showPassword() ? 'eye-off-outline' : 'eye-outline'" />
            </button>
          </div>

          @if (error()) {
            <p class="auth-error" role="alert">{{ error() }}</p>
          }

          <button type="submit" class="auth-btn" [disabled]="loading()">
            @if (loading()) { <ion-spinner name="crescent" /> } @else { Create account }
          </button>
        </form>

        <p class="auth-foot">Already have an account? <a routerLink="/login">Sign in</a></p>
      </div>
    </ion-content>
  `,
})
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected readonly roles: { value: Role; label: string }[] = [
    { value: 'student', label: 'Student' },
    { value: 'faculty', label: 'Faculty' },
    { value: 'staff', label: 'Staff' },
  ];

  form = {
    role: 'student' as Role,
    name: '',
    id_number: '',
    email: '',
    password: '',
  };
  protected showPassword = signal(false);
  protected loading = signal(false);
  protected error = signal('');

  back(): void {
    void this.router.navigateByUrl('/login');
  }

  async submit(): Promise<void> {
    const f = this.form;
    if (!f.name.trim() || !f.email.trim() || !f.password) {
      this.error.set('Enter your full name, school email and password.');
      return;
    }
    if (f.password.length < 8) {
      this.error.set('Password must be at least 8 characters.');
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
