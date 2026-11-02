import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { CATEGORIES, User, WorkOrder } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { initials } from '../../shared/dash';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';

interface TechnicianData {
  technician: User;
  active: WorkOrder[];
  completed: WorkOrder[];
  avg_hours: number;
}

/** One technician: profile, specialization, availability, and their assigned tasks. */
@Component({
  selector: 'app-technician-detail',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/technicians" /></ion-buttons>
        <ion-title>{{ data()?.technician?.name || 'Technician' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      @if (data(); as d) {
        @let t = d.technician;
        <div class="max">
          <div class="panel eq-head">
            <div class="tech-avatar big" [class.off]="!form.is_available">{{ initialsOf(t.name) }}<i></i></div>
            <div>
              <h2 class="mt-0">{{ t.name }}</h2>
              <p class="small muted mt-0">{{ t.email }}{{ t.phone ? ' · ' + t.phone : '' }}</p>
            </div>
          </div>

          <div class="stat-grid">
            <app-stat label="Active tasks" [value]="t.active_count" icon="construct-outline" color="primary" />
            <app-stat label="Overdue" [value]="t.overdue_count" icon="warning-outline" color="danger" />
            <app-stat label="Completed" [value]="t.completed_count" icon="checkmark-done-outline" color="success" />
            <app-stat label="Avg. repair time" [value]="d.avg_hours ? d.avg_hours + ' h' : '—'" icon="time-outline" color="tertiary" />
          </div>

          <div class="section-title">Profile</div>
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Specialization" interface="action-sheet" placeholder="None" [(ngModel)]="form.specialization">
                  @for (c of categories; track c.value) {
                    <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input label="Phone" labelPlacement="fixed" type="tel" [(ngModel)]="form.phone" />
              </ion-item>
              <ion-item>
                <ion-toggle [(ngModel)]="form.is_available">Available for new tasks</ion-toggle>
              </ion-item>
              <ion-item>
                <ion-toggle [(ngModel)]="form.is_active">Account active (can sign in)</ion-toggle>
              </ion-item>
            </ion-list>
            <ion-button expand="block" (click)="save()">Save changes</ion-button>
            <ion-button expand="block" fill="clear" [routerLink]="['/users', t.id]">More account settings</ion-button>
          </div>

          <div class="section-title">Assigned tasks ({{ d.active.length }})</div>
          <ion-list class="cards">
            @for (w of d.active; track w.id) {
              <ion-item button detail [routerLink]="['/work-orders', w.id]">
                <ion-label>
                  <h3>{{ w.title }}</h3>
                  <p>{{ w.reference }}{{ w.equipment ? ' · ' + w.equipment.code : '' }} · {{ w.facility?.full_name || 'No location' }}</p>
                  @if (w.due_date) { <p [class.text-danger]="isOverdue(w)">Due {{ w.due_date | date: 'MMM d, y' }}</p> }
                  <div class="pills">
                    <app-badge kind="status" [value]="w.status" />
                    <app-badge kind="priority" [value]="w.priority" />
                    @if (w.type === 'preventive') { <ion-badge color="tertiary" class="pill">Preventive</ion-badge> }
                  </div>
                </ion-label>
              </ion-item>
            } @empty {
              <app-empty text="No active tasks." icon="checkmark-done-outline" />
            }
          </ion-list>
          <ion-button expand="block" fill="outline" routerLink="/work-orders/new">
            <ion-icon slot="start" name="add-outline" /> New work order
          </ion-button>

          <div class="section-title">Recently completed</div>
          <ion-list class="cards">
            @for (w of d.completed; track w.id) {
              <ion-item button detail [routerLink]="['/work-orders', w.id]">
                <ion-label>
                  <h3>{{ w.title }}</h3>
                  <p>{{ w.reference }} · done {{ w.completed_at | date: 'MMM d, y' }}</p>
                </ion-label>
              </ion-item>
            } @empty {
              <p class="muted small">Nothing completed yet.</p>
            }
          </ion-list>
        </div>
      } @else if (loadError()) {
        <app-empty [text]="loadError()" icon="alert-circle-outline" />
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
})
export class TechnicianDetailPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);

  readonly id = input.required<string>();
  protected data = signal<TechnicianData | null>(null);
  protected loadError = signal('');
  protected categories = CATEGORIES;
  protected initialsOf = initials;
  form = { specialization: null as string | null, phone: '', is_available: true, is_active: true };

  protected isOverdue(w: WorkOrder): boolean {
    return !!w.due_date && w.due_date < new Date().toISOString().slice(0, 10);
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set('');
    try {
      const d = await this.api.get<TechnicianData>(`technicians/${this.id()}`);
      const t = d.technician;
      this.form = { specialization: t.specialization ?? null, phone: t.phone ?? '', is_available: t.is_available, is_active: t.is_active };
      this.data.set(d);
      this.cdr.markForCheck();
    } catch (err) {
      this.loadError.set(errorMessage(err));
    }
  }

  async save(): Promise<void> {
    const ok = await this.ui.busy(() => this.api.put<User>(`technicians/${this.id()}`, this.form).then(() => true));
    if (ok) {
      await this.ui.toast('Technician updated.', 'success');
      await this.load();
    }
  }
}
