import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CATEGORIES, MANAGED_ROLES, User } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { CapitalizeDirective } from '../../shared/capitalize';

/** Admin: create or edit student, faculty, staff and technician accounts (admins use their own Profile). */
@Component({
  selector: 'app-user-form',
  imports: [...IONIC, FormsModule, CapitalizeDirective],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/users" /></ion-buttons>
        <ion-title>{{ isEdit() ? 'Edit User' : 'New User' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding page">
      @if (ready()) {
        <form class="max" (ngSubmit)="save()">
          @if (stats(); as s) {
            <div class="panel small">
              @if (form.role === 'maintenance') {
                {{ s.active_work_orders }} active task(s) · {{ s.completed_work_orders }} completed
              } @else {
                {{ s.reports_count }} report(s) submitted
              }
            </div>
          }
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Role" labelPlacement="stacked" name="role" interface="popover" [(ngModel)]="form.role" [disabled]="isSelf()">
                  @for (r of roles; track r.value) {
                    <ion-select-option [value]="r.value">{{ r.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item><ion-input label="Full name" labelPlacement="stacked" name="name" appCapitalize [(ngModel)]="form.name" required /></ion-item>
              <ion-item><ion-input label="Email" labelPlacement="stacked" type="email" name="email" [(ngModel)]="form.email" required /></ion-item>
              <ion-item><ion-input [label]="form.role === 'student' ? 'Student ID' : 'ID number'" labelPlacement="stacked" name="id_number" [placeholder]="form.role === 'student' ? 'e.g. PPY2023-00249' : ''" [(ngModel)]="form.id_number" /></ion-item>
              <ion-item><ion-input label="Department / course" labelPlacement="stacked" name="department" [(ngModel)]="form.department" /></ion-item>
              <ion-item><ion-input label="Phone" labelPlacement="stacked" type="tel" name="phone" [(ngModel)]="form.phone" /></ion-item>
              @if (form.role === 'maintenance') {
                <ion-item>
                  <ion-select label="Specialization" labelPlacement="stacked" name="spec" interface="action-sheet" [(ngModel)]="form.specialization">
                    @for (c of categories; track c.value) {
                      <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
                <ion-item>
                  <ion-toggle name="avail" [(ngModel)]="form.is_available">Available for assignments</ion-toggle>
                </ion-item>
              }
              <ion-item>
                <ion-toggle name="active" [(ngModel)]="form.is_active" [disabled]="isSelf()">Account active (can sign in)</ion-toggle>
              </ion-item>
              <ion-item>
                <ion-input
                  [label]="isEdit() ? 'New password (leave blank to keep)' : 'Password'"
                  labelPlacement="stacked"
                  type="password"
                  name="password"
                  [(ngModel)]="form.password"
                  helperText="At least 6 characters"
                />
              </ion-item>
            </ion-list>
          </div>
          <ion-button expand="block" type="submit" [disabled]="saving()">{{ isEdit() ? 'Save changes' : 'Create user' }}</ion-button>
          @if (isEdit() && !isSelf()) {
            <ion-button expand="block" fill="clear" color="danger" (click)="remove()">Delete user</ion-button>
          }
        </form>
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
})
export class UserFormPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly id = input<string>();
  protected isEdit = computed(() => !!this.id());
  protected isSelf = computed(() => this.id() === String(this.auth.user()?.id));

  protected roles = MANAGED_ROLES;
  protected categories = CATEGORIES;
  protected ready = signal(false);
  protected saving = signal(false);
  protected stats = signal<{ reports_count: number; active_work_orders: number; completed_work_orders: number } | null>(null);

  form = {
    role: 'student',
    name: '',
    email: '',
    id_number: '',
    department: '',
    phone: '',
    specialization: null as string | null,
    is_active: true,
    is_available: true,
    password: '',
  };

  async ionViewWillEnter(): Promise<void> {
    if (this.ready()) return;
    // e.g. "Add technician" opens this form with ?role=maintenance
    const role = this.route.snapshot.queryParamMap.get('role');
    if (!this.id() && role) this.form.role = role as typeof this.form.role;
    if (this.id()) {
      try {
        const u = await this.api.get<User & { reports_count: number; active_work_orders: number; completed_work_orders: number }>(`users/${this.id()}`);
        Object.assign(this.form, {
          role: u.role,
          name: u.name,
          email: u.email,
          id_number: u.id_number ?? '',
          department: u.department ?? '',
          phone: u.phone ?? '',
          specialization: u.specialization ?? null,
          is_active: u.is_active,
          is_available: u.is_available,
        });
        this.stats.set(u);
      } catch (err) {
        await this.ui.error(err);
        return;
      }
    }
    this.ready.set(true);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      if (this.isEdit()) {
        await this.api.put(`users/${this.id()}`, this.form);
      } else {
        await this.api.post('users', this.form);
      }
      await this.ui.toast('User saved.', 'success');
      await this.router.navigateByUrl('/users', { replaceUrl: true });
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    if (!(await this.ui.confirm('Delete user', 'Their reports will also be deleted. Consider deactivating instead.', 'Delete', true))) return;
    const ok = await this.ui.busy(() => this.api.delete(`users/${this.id()}`).then(() => true));
    if (ok) await this.router.navigateByUrl('/users', { replaceUrl: true });
  }
}
