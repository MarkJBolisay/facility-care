import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { User, labelOf } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';
import { CapitalizeDirective } from '../../shared/capitalize';

/** Philippine mobile: 09XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX (spaces/dashes allowed). */
const PH_MOBILE = /^(?:\+?63|0)9\d{9}$/;

function cleanPhone(value: string): string {
  let phone = value.replace(/[\s\-().]/g, '');
  if (phone.startsWith('+63')) phone = `0${phone.slice(3)}`;
  else if (/^63\d{10}$/.test(phone)) phone = `0${phone.slice(2)}`;
  return phone;
}

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
          @if (auth.isReporter()) {
            <!-- Student / Faculty / Staff: read-only identity, editable contact details -->
            <div class="pf-hero">
              <svg viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0,38 C120,68 270,8 400,36 L400,80 L0,80 Z" fill="#f5c518" fill-opacity="0.85" />
              </svg>
              <div class="pf-avatar">{{ initials() }}</div>
              <div class="pf-hero-text">
                <span class="pf-campus">NEUST PAPAYA OFF-CAMPUS</span>
                <h1>{{ auth.user()?.name }}</h1>
                <span class="pf-role"><ion-icon name="id-card-outline" /> {{ roleLabel() }}</span>
              </div>
            </div>

            <div class="section-title">
              Account information
              <span class="pf-lock-note"><ion-icon name="lock-closed-outline" /> Locked</span>
            </div>
            <div class="panel pf-card">
              <div class="pf-row">
                <span class="pf-row-icon"><ion-icon name="person-outline" /></span>
                <div class="pf-row-body">
                  <span class="pf-label">Full Name</span>
                  <strong>{{ auth.user()?.name }}</strong>
                </div>
                <ion-icon class="pf-lock" name="lock-closed-outline" aria-label="Read-only" />
              </div>
              <div class="pf-row">
                <span class="pf-row-icon"><ion-icon name="mail-outline" /></span>
                <div class="pf-row-body">
                  <span class="pf-label">Email Address</span>
                  <strong>{{ auth.user()?.email }}</strong>
                </div>
                <ion-icon class="pf-lock" name="lock-closed-outline" aria-label="Read-only" />
              </div>
              <div class="pf-row">
                <span class="pf-row-icon"><ion-icon name="school-outline" /></span>
                <div class="pf-row-body">
                  <span class="pf-label">Account Type</span>
                  <strong>{{ roleLabel() }}</strong>
                </div>
                <ion-icon class="pf-lock" name="lock-closed-outline" aria-label="Read-only" />
              </div>
              @if (auth.user()?.id_number) {
                <div class="pf-row">
                  <span class="pf-row-icon"><ion-icon name="id-card-outline" /></span>
                  <div class="pf-row-body">
                    <span class="pf-label">{{ auth.user()?.role === 'student' ? 'Student ID' : 'Employee ID' }}</span>
                    <strong>{{ auth.user()?.id_number }}</strong>
                  </div>
                  <ion-icon class="pf-lock" name="lock-closed-outline" aria-label="Read-only" />
                </div>
              }
            </div>

            <div class="section-title">Contact details</div>
            <div class="panel pf-card">
              @if (!editing()) {
                <div class="pf-row">
                  <span class="pf-row-icon"><ion-icon name="call-outline" /></span>
                  <div class="pf-row-body">
                    <span class="pf-label">Phone Number <span class="pf-opt">Optional</span></span>
                    <strong [class.pf-unset]="!auth.user()?.phone">{{ auth.user()?.phone || 'Not set' }}</strong>
                  </div>
                </div>
                <div class="pf-row">
                  <span class="pf-row-icon"><ion-icon name="business-outline" /></span>
                  <div class="pf-row-body">
                    <span class="pf-label">Department <span class="pf-opt">Optional</span></span>
                    <strong [class.pf-unset]="!auth.user()?.department">{{ auth.user()?.department || 'Not set' }}</strong>
                  </div>
                </div>
                <ion-button expand="block" class="pf-primary" (click)="startEdit()">
                  <ion-icon slot="start" name="create-outline" /> Edit Profile
                </ion-button>
              } @else {
                <p class="pf-note"><ion-icon name="information-circle-outline" /> Only phone number and department can be changed.</p>
                <div class="pf-field">
                  <div class="pf-label">Phone Number <span class="pf-opt">Optional</span></div>
                  <ion-input
                    type="tel"
                    inputmode="tel"
                    placeholder="09171234567"
                    maxlength="30"
                    [(ngModel)]="form.phone"
                  />
                  <span class="pf-hint">Philippine mobile, e.g. 0917 123 4567</span>
                </div>
                <div class="pf-field">
                  <div class="pf-label">Department <span class="pf-opt">Optional</span></div>
                  <ion-input
                    placeholder="e.g. College of Engineering"
                    maxlength="255"
                    [(ngModel)]="form.department"
                  />
                </div>
                <div class="pf-actions">
                  <ion-button fill="outline" (click)="cancel()">Cancel</ion-button>
                  <ion-button class="pf-primary" (click)="saveProfile()">
                    <ion-icon slot="start" name="save-outline" /> Save Changes
                  </ion-button>
                </div>
              }
            </div>

            <ion-button expand="block" fill="clear" color="danger" class="pf-signout" (click)="logout()">
              <ion-icon slot="start" name="log-out-outline" /> Sign out
            </ion-button>
          } @else {
            <!-- Administrator and technician profiles remain unchanged -->
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
          }
        </div>
      }
    </ion-content>
  `,
  styles: [
    `
      .pf-hero {
        position: relative; overflow: hidden; display: flex; align-items: center; gap: 14px;
        padding: 22px 18px 30px; border-radius: 18px; color: #fff;
        background: linear-gradient(125deg, #0b2a6f 0%, #1565f0 70%, #1f6feb 100%);
        box-shadow: 0 10px 24px rgba(21, 101, 240, 0.22); margin-bottom: 8px;
      }
      .pf-hero svg { position: absolute; inset: auto 0 0; width: 100%; height: 80px; }
      .pf-avatar {
        position: relative; z-index: 1; width: 58px; height: 58px; flex: 0 0 58px; border-radius: 50%;
        display: grid; place-items: center; font-size: 1.2rem; font-weight: 800; color: #0b2a6f;
        background: #f5c518; border: 2px solid rgba(255, 255, 255, 0.85);
      }
      .pf-hero-text { position: relative; z-index: 1; min-width: 0; }
      .pf-campus { font-size: 0.55rem; font-weight: 800; letter-spacing: 0.18em; color: #f5c518; }
      .pf-hero h1 { margin: 4px 0; font-size: 1.15rem; font-weight: 800; line-height: 1.2; overflow-wrap: anywhere; }
      .pf-role { display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; font-weight: 600; color: #e7efff; }
      .pf-role ion-icon { font-size: 15px; }
      .pf-lock-note {
        display: inline-flex; align-items: center; gap: 4px; font-size: 0.68rem; letter-spacing: 0;
        text-transform: none; font-weight: 600; color: var(--fc-muted);
      }
      .pf-lock-note ion-icon { font-size: 13px; }
      .pf-card { padding: 4px 16px 14px; }
      .pf-row {
        display: flex; align-items: center; gap: 12px; padding: 13px 0;
        border-bottom: 1px solid var(--fc-line, #e3e9f2);
      }
      .pf-card > .pf-row:last-of-type, .pf-card > .pf-actions:last-child { border-bottom: 0; }
      .pf-row-icon {
        width: 36px; height: 36px; flex: 0 0 36px; border-radius: 11px; display: grid; place-items: center;
        background: rgba(31, 111, 235, 0.1); color: var(--ion-color-primary); font-size: 19px;
      }
      .pf-row-body { min-width: 0; flex: 1; }
      .pf-label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--fc-muted); }
      .pf-row-body strong { display: block; margin-top: 3px; font-size: 0.92rem; font-weight: 700; overflow-wrap: anywhere; }
      .pf-row-body strong.pf-unset { color: var(--fc-muted); font-weight: 500; font-style: italic; }
      .pf-lock { font-size: 16px; color: var(--fc-muted); opacity: 0.8; }
      .pf-opt {
        display: inline-block; margin-left: 5px; padding: 2px 6px; border-radius: 999px; vertical-align: 1px;
        background: rgba(245, 197, 24, 0.18); color: #8a6a00; font-size: 0.6rem; font-weight: 800;
        letter-spacing: 0.02em;
      }
      .pf-primary { --background: #f5c518; --color: #0b2a6f; --background-hover: #e5b812; --background-activated: #d8ad10; font-weight: 800; margin-top: 14px; }
      .pf-actions { display: flex; gap: 10px; }
      .pf-actions ion-button { flex: 1; margin: 14px 0 0; }
      .pf-actions .pf-primary { margin-top: 14px; }
      .pf-field { padding: 12px 0 2px; border-bottom: 1px solid var(--fc-line, #e3e9f2); }
      .pf-field .pf-label { margin-bottom: 6px; }
      .pf-field ion-input {
        --background: var(--fc-page, #f4f6fa); --border-radius: 12px; --padding-start: 12px;
        --padding-end: 12px; min-height: 44px; font-size: 0.9rem;
      }
      .pf-hint { display: block; margin-top: 5px; font-size: 0.7rem; color: var(--fc-muted); }
      .pf-note {
        display: flex; align-items: center; gap: 6px; margin: 12px 0 0; padding: 10px 12px;
        border-radius: 10px; background: rgba(31, 111, 235, 0.08); color: var(--fc-muted); font-size: 0.76rem;
      }
      .pf-note ion-icon { font-size: 16px; color: var(--ion-color-primary); flex: 0 0 16px; }
      .pf-signout { margin-top: 8px; }
      @media (min-width: 720px) {
        .pf-hero { padding: 28px 24px 34px; }
        .pf-hero h1 { font-size: 1.4rem; }
      }
      @media (prefers-color-scheme: dark) {
        .pf-opt { color: #f5c518; background: rgba(245, 197, 24, 0.14); }
        .pf-row-icon { background: rgba(31, 111, 235, 0.2); }
        .pf-note { background: rgba(31, 111, 235, 0.14); }
      }
    `,
  ],
})
export class ProfilePage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  protected auth = inject(AuthService);
  protected inTabs = inject(Router).url.startsWith('/tabs');
  protected ready = signal(false);
  protected editing = signal(false);
  private cdr = inject(ChangeDetectorRef);

  protected initials = computed(() =>
    (this.auth.user()?.name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join() || 'FC',
  );

  protected roleLabel = computed(() => labelOf('role', this.auth.user()?.role ?? ''));

  form = { name: '', email: '', phone: '', department: '', is_available: true };
  pw = { current_password: '', password: '', password_confirmation: '' };
  private savedContact = { phone: '', department: '' };

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
      this.savedContact = { phone: this.form.phone, department: this.form.department };
    }
    this.editing.set(false);
    this.ready.set(true);
    this.cdr.markForCheck();
  }

  startEdit(): void {
    this.savedContact = { phone: this.form.phone, department: this.form.department };
    this.editing.set(true);
    this.cdr.markForCheck();
  }

  cancel(): void {
    this.form.phone = this.savedContact.phone;
    this.form.department = this.savedContact.department;
    this.editing.set(false);
    this.cdr.markForCheck();
  }

  /** Contact details only; the backend ignores any other submitted field. */
  async saveProfile(): Promise<void> {
    const phone = cleanPhone(this.form.phone);
    if (phone && !PH_MOBILE.test(phone)) {
      await this.ui.toast('Enter a valid Philippine mobile number.', 'danger');
      return;
    }

    const updated = await this.ui.busy(() =>
      this.api.put<User>('me', { phone, department: this.form.department.trim() }),
    );
    if (!updated) return;

    this.auth.setUser(updated);
    this.form.phone = updated.phone ?? '';
    this.form.department = updated.department ?? '';
    this.savedContact = { phone: this.form.phone, department: this.form.department };
    this.editing.set(false);
    this.cdr.markForCheck();
    await this.ui.toast('Profile updated successfully.', 'success');
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
