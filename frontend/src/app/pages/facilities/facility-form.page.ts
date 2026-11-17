import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { FACILITY_STATUSES, FACILITY_TYPES, Facility } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';

@Component({
  selector: 'app-facility-form',
  imports: [...IONIC, FormsModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/facilities" /></ion-buttons>
        <ion-title>{{ id() ? 'Edit Facility' : 'New Facility' }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding page">
      @if (ready()) {
        <form class="max panel" (ngSubmit)="save()">
          <ion-list lines="full">
            <ion-item>
              <ion-select label="Type" labelPlacement="stacked" name="type" interface="popover" [ngModel]="form.type" (ngModelChange)="form.type = $event; typeChanged.set($event)">
                @for (t of types; track t.value) {
                  <ion-select-option [value]="t.value">{{ t.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input label="Name" labelPlacement="stacked" name="name" placeholder="e.g. Chemistry Laboratory 1" [(ngModel)]="form.name" required />
            </ion-item>
            <ion-item>
              <ion-input label="Code (optional)" labelPlacement="stacked" name="code" placeholder="e.g. SB-CHEM1" [(ngModel)]="form.code" />
            </ion-item>
            @if (typeChanged() !== 'building') {
              <ion-item>
                <ion-select label="Building" labelPlacement="stacked" name="parent" interface="action-sheet" placeholder="None (standalone area)" [(ngModel)]="form.parent_id">
                  <ion-select-option [value]="null">None (standalone area)</ion-select-option>
                  @for (b of buildings(); track b.id) {
                    <ion-select-option [value]="b.id">{{ b.name }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input label="Floor" labelPlacement="stacked" name="floor" placeholder="e.g. 2nd" [(ngModel)]="form.floor" />
              </ion-item>
              <ion-item>
                <ion-input label="Capacity" labelPlacement="stacked" type="number" name="capacity" [(ngModel)]="form.capacity" />
              </ion-item>
            }
            <ion-item>
              <ion-select label="Status" labelPlacement="stacked" name="status" interface="popover" [(ngModel)]="form.status">
                @for (s of statuses; track s.value) {
                  <ion-select-option [value]="s.value">{{ s.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-textarea label="Description / notes" labelPlacement="stacked" name="description" [autoGrow]="true" rows="3" [(ngModel)]="form.description" />
            </ion-item>
          </ion-list>
          <ion-button expand="block" type="submit" class="ion-margin-top" [disabled]="saving()">
            {{ id() ? 'Save changes' : 'Add facility' }}
          </ion-button>
          @if (id()) {
            <ion-button expand="block" fill="clear" color="danger" (click)="remove()">Delete facility</ion-button>
          }
        </form>
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
})
export class FacilityFormPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly id = input<string>();

  protected types = FACILITY_TYPES;
  protected statuses = FACILITY_STATUSES;
  protected facilities = signal<Facility[]>([]);
  protected buildings = computed(() => this.facilities().filter((f) => f.type === 'building' && String(f.id) !== this.id()));
  protected ready = signal(false);
  protected saving = signal(false);
  protected typeChanged = signal('room');

  form = {
    type: 'room',
    name: '',
    code: '',
    parent_id: null as number | null,
    floor: '',
    capacity: null as number | null,
    status: 'operational',
    description: '',
  };

  async ionViewWillEnter(): Promise<void> {
    if (this.ready()) return;
    try {
      this.facilities.set(await this.api.get<Facility[]>('facilities'));
      if (this.id()) {
        const f = await this.api.get<Facility>(`facilities/${this.id()}`);
        Object.assign(this.form, {
          type: f.type,
          name: f.name,
          code: f.code ?? '',
          parent_id: f.parent_id,
          floor: f.floor ?? '',
          capacity: f.capacity,
          status: f.status,
          description: f.description ?? '',
        });
      } else {
        const parent = this.route.snapshot.queryParamMap.get('parent');
        if (parent) this.form.parent_id = Number(parent);
      }
      this.typeChanged.set(this.form.type);
      this.ready.set(true);
    } catch (err) {
      await this.ui.error(err);
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const body = {
        ...this.form,
        parent_id: this.form.type === 'building' ? null : this.form.parent_id,
        capacity: this.form.capacity === null || (this.form.capacity as unknown) === '' ? null : this.form.capacity,
      };
      const f = this.id()
        ? await this.api.put<Facility>(`facilities/${this.id()}`, body)
        : await this.api.post<Facility>('facilities', body);
      await this.ui.toast('Facility saved.', 'success');
      await this.router.navigate(['/facilities', f.id], { replaceUrl: true });
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const sure = await this.ui.confirm(
      'Delete facility',
      'This permanently deletes it. A place with reports, work orders or equipment can only be closed.',
      'Delete',
      true,
    );
    if (!sure) return;
    try {
      await this.api.delete(`facilities/${this.id()}`);
      await this.ui.toast('Facility deleted.', 'success');
      await this.router.navigateByUrl('/tabs/facilities', { replaceUrl: true });
    } catch (err) {
      // it has history: offer to close it instead
      const body = err instanceof HttpErrorResponse ? err.error : null;
      if (err instanceof HttpErrorResponse && err.status === 422 && body?.can_close) {
        if (await this.ui.confirm("Can't delete this facility", body.message, 'Set to Closed')) {
          this.form.status = 'closed';
          await this.save();
        }
        return;
      }
      await this.ui.error(err);
    }
  }
}
