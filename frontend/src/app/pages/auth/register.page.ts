import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IONIC } from '../../shared/ionic';

@Component({
  selector: 'app-register',
  imports: [...IONIC, FormsModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/login" /></ion-buttons>
        <ion-title>Create account</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding page">
      <form class="auth-wrap panel" (ngSubmit)="submit()">
        <ion-list lines="none">
          <ion-item>
            <ion-select label="I am a" labelPlacement="stacked" name="role" [(ngModel)]="form.role" interface="popover">
              <ion-select-option value="student">Student</ion-select-option>
              <ion-select-option value="faculty">Faculty</ion-select-option>
              <ion-select-option value="staff">Staff</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-input label="Full name" labelPlacement="stacked" name="name" [(ngModel)]="form.name" required />
          </ion-item>
          <ion-item>
            <ion-input label="Email" labelPlacement="stacked" type="email" name="email" [(ngModel)]="form.email" required />
          </ion-item>
          <ion-item>
            <ion-input
              [label]="form.role === 'student' ? 'Student ID' : 'Employee ID'"
              labelPlacement="stacked"
              name="id_number"
              [(ngModel)]="form.id_number"
            />
          </ion-item>
          <ion-item>
            <ion-input
              [label]="form.role === 'student' ? 'Course / Program' : 'Department / Office'"
              labelPlacement="stacked"
              name="department"
              [(ngModel)]="form.department"
            />
          </ion-item>
          <ion-item>
            <ion-input label="Phone (optional)" labelPlacement="stacked" type="tel" name="phone" [(ngModel)]="form.phone" />
          </ion-item>
          <ion-item>
            <ion-input label="Password" labelPlacement="stacked" type="password" name="password" [(ngModel)]="form.password" helperText="At least 6 characters" />
          </ion-item>
          <ion-item>
            <ion-input label="Confirm password" labelPlacement="stacked" type="password" name="password_confirmation" [(ngModel)]="form.password_confirmation" />
          </ion-item>
        </ion-list>

        @if (error()) {
          <ion-text color="danger"><p class="small">{{ error() }}</p></ion-text>
        }

        <ion-button expand="block" type="submit" [disabled]="loading()">
          @if (loading()) { <ion-spinner name="crescent" /> } @else { Create account }
        </ion-button>
      </form>
    </ion-content>
  `,
})
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  form = {
    role: 'student',
    name: '',
    email: '',
    id_number: '',
    department: '',
    phone: '',
    password: '',
    password_confirmation: '',
  };
  protected loading = signal(false);
  protected error = signal('');

  async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const user = await this.auth.register(this.form);
      await this.router.navigateByUrl(this.auth.homeUrl(user.role), { replaceUrl: true });
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
