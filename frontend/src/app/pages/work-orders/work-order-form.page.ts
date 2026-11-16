import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonRouterOutlet, NavController } from '@ionic/angular';
import { ApiService } from '../../core/api.service';
import { CATEGORIES, Equipment, Facility, PRIORITIES, Report, User, WORK_ORDER_TYPES, WorkOrder } from '../../core/models';
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
        <ion-title>{{ id() ? 'Edit Work Order' : report() ? 'Assign Technician' : 'New Work Order' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      @if (ready()) {
        <form class="max" (ngSubmit)="save()">
          @if (report(); as r) {
            <div class="panel">
              <p class="small muted mt-0">For request {{ r.reference }}</p>
              <strong>{{ r.title }}</strong>
              <p class="small mb-0">{{ r.facility?.full_name }}{{ r.equipment ? ' · ' + r.equipment.name + ' (' + r.equipment.code + ')' : '' }}</p>
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
                <ion-select label="Location" labelPlacement="stacked" name="facility" interface="action-sheet" placeholder="Select location" [ngModel]="form.facility_id" (ngModelChange)="pickFacility($event)">
                  @for (f of facilities(); track f.id) {
                    <ion-select-option [value]="f.id">{{ f.full_name }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              @if (equipmentList().length) {
                <ion-item>
                  <ion-select label="Equipment" labelPlacement="stacked" name="equipment" interface="action-sheet" placeholder="Not a specific equipment" [(ngModel)]="form.equipment_id">
                    <ion-select-option [value]="null">Not a specific equipment</ion-select-option>
                    @for (e of equipmentList(); track e.id) {
                      <ion-select-option [value]="e.id">{{ e.name }} ({{ e.code }})</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              }
              <ion-item>
                <ion-select label="Type" labelPlacement="stacked" name="type" interface="popover" [(ngModel)]="form.type">
                  @for (t of types; track t.value) {
                    <ion-select-option [value]="t.value">{{ t.value === 'corrective' ? 'Repair (corrective)' : 'Preventive maintenance' }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Category" labelPlacement="stacked" name="category" interface="action-sheet" [ngModel]="form.category" (ngModelChange)="pickCategory($event)">
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
                <ion-input label="Target completion date" labelPlacement="stacked" type="date" name="due" [min]="minDue()" [(ngModel)]="form.due_date" />
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

          <div class="section-title">Assign technician</div>
          <p class="small muted">
            Ranked by specialization match, availability and current workload. The top match is recommended.
          </p>
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
                <div slot="start" class="match-score" [class.top]="p.is_recommended">{{ p.match_score }}<small>match</small></div>
                <ion-label class="ion-text-wrap">
                  <h3>
                    {{ p.name }}
                    @if (p.is_recommended) { <span class="rec-badge"><ion-icon name="sparkles" /> Recommended</span> }
                  </h3>
                  <p>{{ p.specialization | label: 'category' }} · {{ p.completed_count }} completed</p>
                  <p class="match-reasons">
                    @for (reason of p.match_reasons; track reason) {
                      <span [class.bad]="reason.includes('overdue') || reason.startsWith('Not ')">{{ reason }}</span>
                    }
                  </p>
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
  styles: [
    `
      ion-item.selected { border-color: var(--ion-color-primary) !important; box-shadow: 0 0 0 2px rgba(var(--ion-color-primary-rgb), 0.15); }
      .match-score {
        display: grid; place-items: center; width: 48px; height: 48px; margin-right: 12px; border-radius: 14px; flex-shrink: 0;
        background: var(--fc-page); font-weight: 800; font-size: 1.05rem; line-height: 1; color: var(--fc-muted);
      }
      .match-score small { display: block; font-size: 0.55rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
      .match-score.top { background: rgba(var(--ion-color-success-rgb), 0.15); color: var(--ion-color-success-shade); }
      .rec-badge {
        display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; padding: 1px 8px; border-radius: 999px; vertical-align: 2px;
        background: rgba(var(--ion-color-success-rgb), 0.15); color: var(--ion-color-success-shade); font-size: 0.68rem; font-weight: 700;
      }
      .match-reasons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px !important; }
      .match-reasons span { padding: 1px 7px; border-radius: 999px; background: var(--fc-page); font-size: 0.7rem; }
      .match-reasons span.bad { color: var(--ion-color-danger); }
    `,
  ],
})
export class WorkOrderFormPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private nav = inject(NavController);
  private outlet = inject(IonRouterOutlet, { optional: true });

  readonly id = input<string>();

  protected categories = CATEGORIES;
  protected priorities = PRIORITIES;
  protected types = WORK_ORDER_TYPES;
  protected equipmentList = signal<Equipment[]>([]);
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
    equipment_id: null as number | null,
    type: 'corrective' as 'corrective' | 'preventive',
  };

  async ionViewWillEnter(): Promise<void> {
    if (this.ready()) return;
    try {
      const qp = this.route.snapshot.queryParamMap;
      const reportId = qp.get('reportId');
      const [facilities, personnel, wo, report] = await Promise.all([
        this.api.get<Facility[]>('facilities'),
        this.api.get<User[]>('personnel', { category: qp.get('category') ?? '', report_id: reportId ?? '' }),
        this.id() ? this.api.get<WorkOrder>(`work-orders/${this.id()}`) : Promise.resolve(null),
        reportId ? this.api.get<Report>(`reports/${reportId}`) : Promise.resolve(null),
      ]);
      this.facilities.set(facilities);
      this.personnel.set(personnel);

      if (wo) {
        this.savedDue = wo.due_date?.slice(0, 10) ?? '';
        Object.assign(this.form, {
          title: wo.title,
          description: wo.description ?? '',
          facility_id: wo.facility_id,
          category: wo.category,
          priority: wo.priority,
          due_date: wo.due_date?.slice(0, 10) ?? '',
          assigned_to: wo.assigned_to,
          status: wo.status,
          report_id: wo.report_id,
          equipment_id: wo.equipment_id,
          type: wo.type,
        });
        void this.loadEquipment(wo.facility_id);
        void this.rank();
      } else if (report) {
        this.report.set(report);
        Object.assign(this.form, {
          title: report.title,
          description: report.description,
          facility_id: report.facility_id,
          category: qp.get('category') || report.category,
          priority: qp.get('priority') || report.priority || 'medium',
          report_id: report.id,
          equipment_id: report.equipment_id,
        });
        void this.loadEquipment(report.facility_id);
        // Smart assignment: preselect the recommended technician
        this.form.assigned_to = (personnel.find((p) => p.is_recommended) ?? personnel.find((p) => p.is_available))?.id ?? null;
      }
      this.ready.set(true);
    } catch (err) {
      await this.ui.error(err);
    }
  }

  /** Equipment in the chosen location, for the Equipment field. */
  private async loadEquipment(facilityId: number | null): Promise<void> {
    this.equipmentList.set(facilityId ? await this.api.get<Equipment[]>('equipment', { facility_id: facilityId }).catch(() => []) : []);
  }

  pickFacility(id: number | null): void {
    this.form.facility_id = id;
    this.form.equipment_id = null;
    void this.loadEquipment(id);
  }

  /** Re-rank technicians when the category changes. */
  pickCategory(category: string | null): void {
    this.form.category = category;
    void this.rank();
  }

  private async rank(): Promise<void> {
    const list = await this.api.get<User[]>('personnel', { category: this.form.category ?? '' }).catch(() => null);
    if (list) this.personnel.set(list);
  }

  /** The target date already saved on this work order (may be overdue). */
  private savedDue = '';
  /** Earliest pickable target date: today, or the saved date if that is earlier. */
  protected minDue(): string {
    const today = todayLocal();
    return this.savedDue && this.savedDue < today ? this.savedDue : today;
  }

  async save(): Promise<void> {
    if (!this.form.title.trim()) {
      await this.ui.toast('Title is required.', 'warning');
      return;
    }
    // a new target date can't be in the past (an overdue date that is already saved may stay)
    if (this.form.due_date && this.form.due_date !== this.savedDue && this.form.due_date < todayLocal()) {
      await this.ui.toast("Target date can't be in the past.", 'warning');
      return;
    }
    this.saving.set(true);
    try {
      const body = { ...this.form, due_date: this.form.due_date || null };
      const wo = this.id()
        ? await this.api.put<WorkOrder>(`work-orders/${this.id()}`, body)
        : await this.api.post<WorkOrder>('work-orders', body);
      // Assigned from a report: go back to where the admin came from (the report or the dashboard queue)
      if (!this.id() && this.form.report_id && this.outlet?.canGoBack()) {
        const who = this.personnel().find((p) => p.id === wo.assigned_to)?.name;
        await this.ui.toast(who ? `${wo.reference} assigned to ${who}. They have been notified.` : `Work order ${wo.reference} created.`, 'success');
        await this.nav.pop();
        return;
      }
      await this.ui.toast(this.id() ? 'Work order updated.' : `Work order ${wo.reference} created.`, 'success');
      await this.router.navigate(['/work-orders', wo.id], { replaceUrl: true });
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.saving.set(false);
    }
  }
}

/** Today as YYYY-MM-DD in the phone's own timezone. */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
