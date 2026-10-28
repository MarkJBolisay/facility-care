import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CATEGORIES, Facility, PRIORITIES, Report, User, WorkOrder } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';

/**
 * Create a work order (optionally from a report = maintenance assignment),
 * or edit / reassign an existing one.
 */
@Component({
  selector: 'app-work-order-form',
  imports: [...IONIC, ...SHARED, FormsModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/work-orders" /></ion-buttons>
        <ion-title>{{ id() ? 'Edit Work Order' : report() ? 'Assign Maintenance' : 'New Work Order' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      @if (ready()) {
        <form class="max" (ngSubmit)="save()">
          @if (report(); as r) {
            <div class="panel">
              <p class="small muted mt-0">For report {{ r.reference }}</p>
              <strong>{{ r.title }}</strong>
              <p class="small">{{ r.facility?.full_name }}</p>
            </div>
          }

          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-input label="Title" labelPlacement="stacked" name="title" [(ngModel)]="form.title" required />
              </ion-item>
              <ion-item>
                <ion-textarea label="Instructions / description" labelPlacement="stacked" name="description" [autoGrow]="true" rows="3" [(ngModel)]="form.description" />
              </ion-item>
              <ion-item>
                <ion-select label="Facility" labelPlacement="stacked" name="facility" interface="action-sheet" placeholder="Select facility" [(ngModel)]="form.facility_id">
                  @for (f of facilities(); track f.id) {
                    <ion-select-option [value]="f.id">{{ f.full_name }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Category" labelPlacement="stacked" name="category" interface="action-sheet" [(ngModel)]="form.category">
                  @for (c of categories; track c.value) {
                    <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Priority" labelPlacement="stacked" name="priority" interface="popover" [(ngModel)]="form.priority">
                  @for (p of priorities; track p.value) {
                    <ion-select-option [value]="p.value">{{ p.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input label="Target completion date" labelPlacement="stacked" type="date" name="due" [(ngModel)]="form.due_date" />
              </ion-item>
              @if (id()) {
                <ion-item>
                  <ion-select label="Status" labelPlacement="stacked" name="status" interface="popover" [(ngModel)]="form.status">
                    <ion-select-option value="pending">Pending</ion-select-option>
                    <ion-select-option value="in_progress">In Progress</ion-select-option>
                    <ion-select-option value="completed">Completed</ion-select-option>
                    <ion-select-option value="cancelled">Cancelled</ion-select-option>
                  </ion-select>
                </ion-item>
              }
            </ion-list>
          </div>

          <div class="section-title">Assign to</div>
          <p class="small muted">Sorted by availability and current workload.</p>
          <ion-list class="cards">
            <ion-item button (click)="form.assigned_to = null" [class.selected]="form.assigned_to === null">
              <ion-icon slot="start" name="person-outline" color="medium" />
              <ion-label>Leave unassigned for now</ion-label>
              @if (form.assigned_to === null) {
                <ion-icon slot="end" name="checkmark-circle-outline" color="primary" />
              }
            </ion-item>
            @for (p of personnel(); track p.id) {
              <ion-item button (click)="form.assigned_to = p.id" [class.selected]="form.assigned_to === p.id">
                <ion-icon slot="start" name="construct-outline" [color]="p.is_available ? 'success' : 'medium'" />
                <ion-label>
                  <h3>{{ p.name }}</h3>
                  <p>
                    {{ p.specialization | label: 'category' }} ·
                    <span [style.color]="p.is_available ? 'var(--ion-color-success)' : 'var(--ion-color-medium)'">
                      {{ p.is_available ? 'Available' : 'Unavailable' }}
                    </span>
                    @if (p.specialization && p.specialization === form.category) { · ⭐ matches category }
                  </p>
                  <p>{{ p.active_count }} active task(s) · {{ p.completed_count }} completed</p>
                </ion-label>
                @if (form.assigned_to === p.id) {
                  <ion-icon slot="end" name="checkmark-circle-outline" color="primary" />
                }
              </ion-item>
            }
          </ion-list>

          <ion-button expand="block" type="submit" [disabled]="saving()">
            @if (saving()) { <ion-spinner name="crescent" /> } @else { {{ id() ? 'Save changes' : 'Create work order' }} }
          </ion-button>
        </form>
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
  styles: [`ion-item.selected { border-color: var(--ion-color-primary) !important; }`],
})
export class WorkOrderFormPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly id = input<string>();

  protected categories = CATEGORIES;
  protected priorities = PRIORITIES;
  protected facilities = signal<Facility[]>([]);
  protected personnel = signal<User[]>([]);
  protected report = signal<Report | null>(null);
  protected ready = signal(false);
  protected saving = signal(false);

  form = {
    title: '',
    description: '',
    facility_id: null as number | null,
    category: null as string | null,
    priority: 'medium',
    due_date: '',
    assigned_to: null as number | null,
    status: 'pending',
    report_id: null as number | null,
  };

  async ionViewWillEnter(): Promise<void> {
    if (this.ready()) return;
    try {
      const qp = this.route.snapshot.queryParamMap;
      const reportId = qp.get('reportId');
      const [facilities, personnel, wo, report] = await Promise.all([
        this.api.get<Facility[]>('facilities'),
        this.api.get<User[]>('personnel'),
        this.id() ? this.api.get<WorkOrder>(`work-orders/${this.id()}`) : Promise.resolve(null),
        reportId ? this.api.get<Report>(`reports/${reportId}`) : Promise.resolve(null),
      ]);
      this.facilities.set(facilities);
      this.personnel.set(personnel);

      if (wo) {
        Object.assign(this.form, {
          title: wo.title,
          description: wo.description ?? '',
          facility_id: wo.facility_id,
          category: wo.category,
          priority: wo.priority,
          due_date: wo.due_date ?? '',
          assigned_to: wo.assigned_to,
          status: wo.status,
          report_id: wo.report_id,
        });
      } else if (report) {
        this.report.set(report);
        Object.assign(this.form, {
          title: report.title,
          description: report.description,
          facility_id: report.facility_id,
          category: qp.get('category') || report.category,
          priority: qp.get('priority') || report.priority || 'medium',
          report_id: report.id,
        });
        // Suggest the best match: available, right specialization, least busy.
        const best = personnel.find((p) => p.is_available && p.specialization === this.form.category)
          ?? personnel.find((p) => p.is_available);
        this.form.assigned_to = best?.id ?? null;
      }
      this.ready.set(true);
    } catch (err) {
      await this.ui.error(err);
    }
  }

  async save(): Promise<void> {
    if (!this.form.title.trim()) {
      await this.ui.toast('Title is required.', 'warning');
      return;
    }
    this.saving.set(true);
    try {
      const body = { ...this.form, due_date: this.form.due_date || null };
      const wo = this.id()
        ? await this.api.put<WorkOrder>(`work-orders/${this.id()}`, body)
        : await this.api.post<WorkOrder>('work-orders', body);
      await this.ui.toast(this.id() ? 'Work order updated.' : `Work order ${wo.reference} created.`, 'success');
      await this.router.navigate(['/work-orders', wo.id], { replaceUrl: true });
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}
