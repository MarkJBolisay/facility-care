import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IONIC } from '../../shared/ionic';

@Component({
  selector: 'app-login',
  imports: [...IONIC, FormsModule, RouterLink],
  template: `
    <ion-content class="ion-padding page">
      <div class="auth-wrap">
        <div class="brand">
          <div class="logo"><ion-icon name="construct-outline" /></div>
          <h1>FacilityCare</h1>
          <p class="muted mt-0">School facility reporting &amp; maintenance</p>
        </div>

        <form (ngSubmit)="submit()" class="panel">
          <ion-input
            label="Email"
            labelPlacement="floating"
            fill="outline"
            type="email"
            name="email"
            autocomplete="email"
            [(ngModel)]="email"
            required
          />
          <br />
          <ion-input
            label="Password"
            labelPlacement="floating"
            fill="outline"
            type="password"
            name="password"
            autocomplete="current-password"
            [(ngModel)]="password"
            required
          >
          </ion-input>

          @if (error()) {
            <ion-text color="danger"><p class="small">{{ error() }}</p></ion-text>
          }

          <ion-button expand="block" type="submit" class="ion-margin-top" [disabled]="loading()">
            @if (loading()) {
              <ion-spinner name="crescent" />
            } @else {
              Sign in
            }
          </ion-button>
        </form>

        <p class="ion-text-center small">
          Student, faculty or staff without an account?
          <a routerLink="/register">Create one</a>
        </p>

        <div class="panel demo">
          <strong>Demo accounts</strong> (password: <code>password</code>)<br />
          <button type="button" (click)="fill('admin@facilitycare.test')">admin@facilitycare.test</button> — Administrator<br />
          <button type="button" (click)="fill('ramon@facilitycare.test')">ramon@facilitycare.test</button> — Maintenance<br />
          <button type="button" (click)="fill('student@facilitycare.test')">student@facilitycare.test</button> — Student
        </div>
      </div>
    </ion-content>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  protected loading = signal(false);
  protected error = signal('');

  fill(email: string): void {
    this.email = email;
    this.password = 'password';
  }

  async submit(): Promise<void> {
    if (!this.email || !this.password) {
      this.error.set('Enter your email and password.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const user = await this.auth.login(this.email.trim(), this.password);
      this.password = '';
      await this.router.navigateByUrl(this.auth.homeUrl(user.role), { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
