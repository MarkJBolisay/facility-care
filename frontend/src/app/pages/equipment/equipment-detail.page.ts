import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ActivityLog, EQUIPMENT_CONDITIONS, Equipment, Report, WorkOrder, equipmentIcon } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { ActivityComponent } from '../../shared/activity';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';

interface History {
  equipment: Equipment;
  summary: {
    total_requests: number;
    open_requests: number;
    repairs_completed: number;
    services_completed: number;
    materials_cost: number;
    last_service: string | null;
  };
  work_orders: WorkOrder[];
  reports: Report[];
  activity: ActivityLog[];
}

/** Equipment profile, condition, preventive schedule and maintenance history. */
@Component({
  selector: 'app-equipment-detail',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe, DecimalPipe, ActivityComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.isAdmin() ? '/tabs/equipment' : '/tabs/tasks'" /></ion-buttons>
        <ion-title>{{ data()?.equipment?.code || 'Equipment' }}</ion-title>
        @if (auth.isAdmin() && data()) {
          <ion-buttons slot="end">
            <ion-button [routerLink]="['/equipment', id(), 'edit']" aria-label="Edit"><ion-icon slot="icon-only" name="create-outline" /></ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      @if (data(); as d) {
        @let e = d.equipment;
        <div class="max">
          <div class="panel eq-head">
            <div class="eq-icon big" [class]="'eq-icon big tint-' + tone(e.condition)"><ion-icon [name]="icon(e.category)" /></div>
            <div>
              <h2 class="mt-0">{{ e.name }}</h2>
              <p class="small muted mt-0">{{ e.code }} · {{ e.category | label: 'equipmentCategory' }}</p>
              <div class="pills">
                <app-badge kind="condition" [value]="e.condition" />
                <ion-badge color="light" class="pill">{{ e.importance | label: 'importance' }} importance</ion-badge>
              </div>
            </div>
          </div>

          <!-- Condition (admin can change it directly) -->
          @if (auth.isAdmin()) {
            <div class="section-title">Condition</div>
            <ion-segment [value]="e.condition" (ionChange)="setCondition($event)" class="cond-seg" [scrollable]="true">
              @for (c of conditions; track c.value) {
                <ion-segment-button [value]="c.value"><ion-label>{{ c.label }}</ion-label></ion-segment-button>
              }
            </ion-segment>
          }

          <div class="section-title">Profile</div>
          <div class="panel">
            <dl class="kv">
              <dt>Equipment ID</dt><dd>{{ e.code }}</dd>
              <dt>Model</dt><dd>{{ e.model || '—' }}</dd>
              <dt>Serial no.</dt><dd>{{ e.serial_number || '—' }}</dd>
              <dt>Department</dt><dd>{{ e.department || '—' }}</dd>
              <dt>Location</dt>
              <dd>
                @if (e.facility) { <a [routerLink]="['/facilities', e.facility.id]">{{ e.facility.full_name }}</a> } @else { — }
              </dd>
              <dt>Acquired</dt><dd>{{ e.acquisition_date ? (e.acquisition_date | date: 'MMM d, y') : '—' }}</dd>
              @if (e.notes) { <dt>Notes</dt><dd class="pre-wrap">{{ e.notes }}</dd> }
            </dl>
          </div>

          <!-- Preventive maintenance -->
          <div class="section-title">Preventive maintenance</div>
          <div class="panel">
            @if (e.maintenance_interval_days) {
              <dl class="kv">
                <dt>Every</dt><dd>{{ e.maintenance_interval_days }} days</dd>
                <dt>Last serviced</dt><dd>{{ e.last_maintained_at ? (e.last_maintained_at | date: 'MMM d, y') : 'Never' }}</dd>
                <dt>Next due</dt>
                <dd>
                  {{ e.next_maintenance_due | date: 'MMM d, y' }}
                  <app-badge kind="maintenance" [value]="e.maintenance_state" />
                </dd>
              </dl>
              @if (auth.isAdmin()) {
                @if (openPreventive(); as wo) {
                  <ion-item lines="none" button detail [routerLink]="['/work-orders', wo.id]" class="inline-item">
                    <ion-icon slot="start" name="calendar-outline" color="tertiary" />
                    <ion-label>
                      <h3>Scheduled as {{ wo.reference }}</h3>
                      <p>{{ wo.assignee?.name || 'Unassigned' }} · due {{ wo.due_date | date: 'MMM d' }}</p>
                    </ion-label>
                  </ion-item>
                } @else {
                  <ion-button expand="block" fill="outline" (click)="schedule()">
                    <ion-icon slot="start" name="calendar-outline" /> Schedule maintenance now
                  </ion-button>
                  <p class="small muted mb-0">A recommended technician is assigned automatically.</p>
                }
              }
            } @else {
              <p class="muted small mt-0 mb-0">No schedule set.@if (auth.isAdmin()) { Edit this equipment to add one (e.g. every 90 days). }</p>
            }
          </div>

          <div class="stat-grid">
            <app-stat label="Requests" [value]="d.summary.total_requests" icon="document-text-outline" color="tertiary" />
            <app-stat label="Repairs done" [value]="d.summary.repairs_completed" icon="construct-outline" color="primary" />
            <app-stat label="Services done" [value]="d.summary.services_completed" icon="calendar-outline" color="success" />
            <app-stat label="Parts cost" [value]="'₱' + (d.summary.materials_cost | number: '1.0-0')" icon="pricetag-outline" color="warning" />
          </div>

          <ion-segment [(ngModel)]="tab" class="ion-margin-top">
            <ion-segment-button value="history"><ion-label>History ({{ d.work_orders.length }})</ion-label></ion-segment-button>
            <ion-segment-button value="requests"><ion-label>Requests ({{ d.reports.length }})</ion-label></ion-segment-button>
            <ion-segment-button value="activity"><ion-label>Activity</ion-label></ion-segment-button>
          </ion-segment>

          @if (tab === 'history') {
            <ion-list class="cards ion-margin-top">
              @for (w of d.work_orders; track w.id) {
                <ion-item button detail [routerLink]="['/work-orders', w.id]">
                  <ion-label class="ion-text-wrap">
                    <h3>{{ w.title }}</h3>
                    <p>
                      {{ w.reference }} · {{ w.type | label: 'woType' }} ·
                      {{ w.completed_at ? 'Done ' + (w.completed_at | date: 'MMM d, y') : 'Created ' + (w.created_at | date: 'MMM d, y') }}
                    </p>
                    @if (w.assignee) { <p><ion-icon name="person-outline" /> {{ w.assignee.name }}</p> }
                    @if (w.report?.description) { <p><strong>Problem:</strong> {{ w.report.description }}</p> }
                    @if (w.actions_taken) { <p><strong>Actions:</strong> {{ w.actions_taken }}</p> }
                    @if (w.materials?.length) {
                      <p><strong>Parts:</strong> {{ partsOf(w) }}@if (w.materials_cost) { · ₱{{ w.materials_cost | number: '1.0-0' }} }</p>
                    }
                    <div class="pills"><app-badge kind="status" [value]="w.status" /><app-badge kind="priority" [value]="w.priority" /></div>
                  </ion-label>
                </ion-item>
              } @empty {
                <app-empty text="No maintenance recorded yet." icon="construct-outline" />
              }
            </ion-list>
          } @else if (tab === 'requests') {
            <ion-list class="cards ion-margin-top">
              @for (r of d.reports; track r.id) {
                <ion-item button detail [routerLink]="['/reports', r.id]">
                  <ion-label>
                    <h3>{{ r.title }}</h3>
                    <p>{{ r.reference }} · {{ r.created_at | date: 'MMM d, y' }} · {{ r.reporter?.name }}</p>
                    <div class="pills">
                      <app-badge kind="status" [value]="r.status" />
                      @if (r.severity) { <app-badge kind="severity" [value]="r.severity" /> }
                    </div>
                  </ion-label>
                </ion-item>
              } @empty {
                <app-empty text="No repair requests for this equipment." />
              }
            </ion-list>
          } @else {
            <div class="panel ion-margin-top"><app-activity [items]="d.activity" /></div>
          }
        </div>
      } @else if (loadError()) {
        <app-empty [text]="loadError()" icon="alert-circle-outline" />
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
})
export class EquipmentDetailPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  protected auth = inject(AuthService);

  readonly id = input.required<string>();
  protected data = signal<History | null>(null);
  protected loadError = signal('');
  protected conditions = EQUIPMENT_CONDITIONS;
  tab: 'history' | 'requests' | 'activity' = 'history';

  protected icon = equipmentIcon;
  protected tone(condition: string): string {
    return { operational: 'success', needs_repair: 'warning', under_maintenance: 'primary', out_of_service: 'danger' }[condition] ?? 'medium';
  }

  protected openPreventive(): WorkOrder | null {
    return this.data()?.work_orders.find((w) => w.type === 'preventive' && (w.status === 'pending' || w.status === 'in_progress')) ?? null;
  }

  protected partsOf(w: WorkOrder): string {
    return (w.materials ?? []).map((m) => `${m.name} ×${+m.quantity}`).join(', ');
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set('');
    try {
      this.data.set(await this.api.get<History>(`equipment/${this.id()}/history`));
    } catch (err) {
      this.loadError.set(errorMessage(err));
    }
  }

  async setCondition(event: Event): Promise<void> {
    const value = (event as CustomEvent<{ value: string }>).detail.value;
    const d = this.data();
    if (!d || value === d.equipment.condition) return;
    const ok = await this.ui.busy(() => this.api.put<Equipment>(`equipment/${this.id()}`, { condition: value }).then(() => true));
    if (ok) {
      await this.ui.toast('Condition updated.', 'success');
      await this.load();
    }
  }

  async schedule(): Promise<void> {
    const wo = await this.ui.busy(() => this.api.post<WorkOrder>(`equipment/${this.id()}/schedule`, {}));
    if (wo) {
      await this.ui.toast(`${wo.reference} scheduled${wo.assignee ? ' and assigned to ' + wo.assignee.name : ''}.`, 'success');
      await this.router.navigate(['/work-orders', wo.id]);
    }
  }
}
