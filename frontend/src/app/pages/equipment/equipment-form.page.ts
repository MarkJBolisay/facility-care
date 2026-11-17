import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { EQUIPMENT_CATEGORIES, EQUIPMENT_CONDITIONS, Equipment, Facility, IMPORTANCE } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';

/** Add or edit an equipment profile. */
@Component({
  selector: 'app-equipment-form',
  imports: [...IONIC, FormsModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/equipment" /></ion-buttons>
        <ion-title>{{ id() ? 'Edit Equipment' : 'Add Equipment' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      @if (ready()) {
        <form class="max" (ngSubmit)="save()">
          <div class="section-title">Equipment</div>
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-input label="Name *" labelPlacement="stacked" name="name" placeholder="e.g. Split-type Aircon 2HP" [(ngModel)]="form.name" />
              </ion-item>
              <ion-item>
                <ion-select label="Category *" labelPlacement="stacked" interface="action-sheet" name="category" [(ngModel)]="form.category">
                  @for (c of categories; track c.value) {
                    <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input label="Equipment ID" labelPlacement="stacked" name="code" placeholder="Leave blank to generate (EQ-0001)" [(ngModel)]="form.code" />
              </ion-item>
              <ion-item>
                <ion-input label="Model" labelPlacement="stacked" name="model" placeholder="e.g. Carrier Optima 2HP" [(ngModel)]="form.model" />
              </ion-item>
              <ion-item>
                <ion-input label="Serial number" labelPlacement="stacked" name="serial" [(ngModel)]="form.serial_number" />
              </ion-item>
              <ion-item>
                <ion-input label="Department" labelPlacement="stacked" name="department" placeholder="e.g. ICT Department" [(ngModel)]="form.department" />
              </ion-item>
              <ion-item>
                <ion-select label="Location" labelPlacement="stacked" interface="action-sheet" name="facility" placeholder="Choose a room or area" [(ngModel)]="form.facility_id">
                  @for (f of facilities(); track f.id) {
                    <ion-select-option [value]="f.id">{{ f.full_name }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input label="Acquisition date" labelPlacement="stacked" type="date" name="acquired" [(ngModel)]="form.acquisition_date" />
              </ion-item>
            </ion-list>
          </div>

          <div class="section-title">Condition &amp; importance</div>
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Condition" labelPlacement="stacked" interface="action-sheet" name="condition" [(ngModel)]="form.condition">
                  @for (c of conditions; track c.value) {
                    <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
            </ion-list>
            <p class="small"><strong>Importance</strong> <span class="muted">— how much classes or offices depend on it. Used to rank repair requests.</span></p>
            <ion-segment name="importance" [(ngModel)]="form.importance">
              @for (i of importance; track i.value) {
                <ion-segment-button [value]="i.value"><ion-label>{{ i.label }}</ion-label></ion-segment-button>
              }
            </ion-segment>
          </div>

          <div class="section-title">Preventive maintenance</div>
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Service every" labelPlacement="stacked" interface="action-sheet" name="interval" [(ngModel)]="form.maintenance_interval_days">
                  <ion-select-option [value]="null">No schedule</ion-select-option>
                  @for (d of intervals; track d.value) {
                    <ion-select-option [value]="d.value">{{ d.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              @if (form.maintenance_interval_days) {
                <ion-item>
                  <ion-input label="Last serviced" labelPlacement="stacked" type="date" name="last" [(ngModel)]="form.last_maintained_at" />
                </ion-item>
              }
            </ion-list>
            <p class="small muted mb-0">The next service date is worked out from the last service. Reminders are sent when it is due.</p>
          </div>

          <div class="panel">
            <ion-textarea label="Notes" labelPlacement="stacked" [autoGrow]="true" rows="2" name="notes" [(ngModel)]="form.notes" />
          </div>

          <ion-button expand="block" type="submit" [disabled]="saving()">
            @if (saving()) { <ion-spinner name="crescent" /> } @else { {{ id() ? 'Save changes' : 'Add equipment' }} }
          </ion-button>
          @if (id()) {
            <ion-button expand="block" fill="clear" color="danger" (click)="remove()">Delete equipment</ion-button>
          }
        </form>
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
})
export class EquipmentFormPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  readonly id = input<string>();
  protected categories = EQUIPMENT_CATEGORIES;
  protected conditions = EQUIPMENT_CONDITIONS;
  protected importance = IMPORTANCE;
  protected intervals = [
    { value: 30, label: 'Every month (30 days)' },
    { value: 60, label: 'Every 2 months (60 days)' },
    { value: 90, label: 'Every 3 months (90 days)' },
    { value: 120, label: 'Every 4 months (120 days)' },
    { value: 180, label: 'Every 6 months (180 days)' },
    { value: 365, label: 'Every year (365 days)' },
  ];
  protected facilities = signal<Facility[]>([]);
  protected ready = signal(false);
  protected saving = signal(false);

  form = {
    code: '',
    name: '',
    category: 'computer',
    model: '',
    serial_number: '',
    department: '',
    facility_id: null as number | null,
    acquisition_date: '',
    condition: 'operational',
    importance: 'medium',
    maintenance_interval_days: null as number | null,
    last_maintained_at: '',
    notes: '',
  };

  async ionViewWillEnter(): Promise<void> {
    if (this.ready()) return;
    try {
      const [facilities, e] = await Promise.all([
        this.api.get<Facility[]>('facilities'),
        this.id() ? this.api.get<Equipment>(`equipment/${this.id()}`) : Promise.resolve(null),
      ]);
      this.facilities.set(facilities);
      if (e) {
        this.form = {
          code: e.code,
          name: e.name,
          category: e.category,
          model: e.model ?? '',
          serial_number: e.serial_number ?? '',
          department: e.department ?? '',
          facility_id: e.facility_id,
          acquisition_date: e.acquisition_date ?? '',
          condition: e.condition,
          importance: e.importance,
          maintenance_interval_days: e.maintenance_interval_days,
          last_maintained_at: e.last_maintained_at ?? '',
          notes: e.notes ?? '',
        };
      }
      this.ready.set(true);
      this.cdr.markForCheck();
    } catch (err) {
      await this.ui.error(err);
    }
  }

  async save(): Promise<void> {
    if (!this.form.name.trim()) {
      await this.ui.toast('Please enter a name.', 'warning');
      return;
    }
    this.saving.set(true);
    try {
      const body = {
        ...this.form,
        acquisition_date: this.form.acquisition_date || null,
        last_maintained_at: this.form.maintenance_interval_days ? this.form.last_maintained_at || null : null,
      };
      const e = this.id()
        ? await this.api.put<Equipment>(`equipment/${this.id()}`, body)
        : await this.api.post<Equipment>('equipment', body);
      await this.ui.toast(this.id() ? 'Equipment updated.' : `${e.code} added.`, 'success');
      await this.router.navigate(['/equipment', e.id], { replaceUrl: true });
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const sure = await this.ui.confirm(
      'Delete equipment',
      'This permanently deletes it. Equipment with reports or work orders can only be marked Out of Service.',
      'Delete',
      true,
    );
    if (!sure) return;
    try {
      await this.api.delete(`equipment/${this.id()}`);
      await this.ui.toast('Equipment deleted.');
      await this.router.navigateByUrl('/tabs/equipment', { replaceUrl: true });
    } catch (err) {
      // it has repair history: offer to retire it instead
      const body = err instanceof HttpErrorResponse ? err.error : null;
      if (err instanceof HttpErrorResponse && err.status === 422 && body?.can_retire) {
        if (await this.ui.confirm("Can't delete this equipment", body.message, 'Mark Out of Service')) {
          this.form.condition = 'out_of_service';
          await this.save();
        }
        return;
      }
      await this.ui.error(err);
    }
  }
}
