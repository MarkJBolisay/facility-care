import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { pickPhoto, resizeImage } from '../../core/image';
import { CATEGORIES, Equipment, Facility, Report, SEVERITIES } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';

/** Submit a new facility issue report (with optional photo). */
@Component({
  selector: 'app-report-form',
  imports: [...IONIC, FormsModule],
  template: `
    <ion-header>
      <ion-toolbar>
        @if (!inTabs) {
          <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.homeUrl()" /></ion-buttons>
        }
        <ion-title>Report an Issue</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      <form class="max" (ngSubmit)="submit()">
        <div class="panel">
          <ion-list lines="full">
            <ion-item>
              <ion-input label="What's the problem?" labelPlacement="stacked" name="title" placeholder="e.g. Leaking faucet" [(ngModel)]="form.title" required maxlength="255" />
            </ion-item>
            <ion-item>
              <ion-select label="Building" labelPlacement="stacked" name="building" interface="action-sheet" placeholder="Select building" [ngModel]="buildingId()" (ngModelChange)="pickBuilding($event)">
                @for (b of buildings(); track b.id) {
                  <ion-select-option [value]="b.id">{{ b.name }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-select label="Room / Area" labelPlacement="stacked" name="facility" interface="action-sheet" placeholder="Select room, lab or area" [ngModel]="form.facility_id" (ngModelChange)="pickRoom($event)" [disabled]="!buildingId() && !standalone().length">
                @if (buildingId()) {
                  <ion-select-option [value]="buildingId()">Whole building / common area</ion-select-option>
                }
                @for (f of rooms(); track f.id) {
                  <ion-select-option [value]="f.id">{{ f.name }}{{ f.floor ? ' (' + f.floor + ' floor)' : '' }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            @if (equipment().length) {
              <ion-item>
                <ion-select label="Equipment (optional)" labelPlacement="stacked" name="equipment" interface="action-sheet" placeholder="Is it a specific equipment?" [(ngModel)]="form.equipment_id">
                  <ion-select-option [value]="null">Not a specific equipment</ion-select-option>
                  @for (e of equipment(); track e.id) {
                    <ion-select-option [value]="e.id">{{ e.name }} ({{ e.code }})</ion-select-option>
                  }
                </ion-select>
              </ion-item>
            }
            <ion-item>
              <ion-input label="Exact location (optional)" labelPlacement="stacked" name="loc" placeholder="e.g. Near the back door" [(ngModel)]="form.location_details" />
            </ion-item>
            <ion-item>
              <ion-select label="Category (optional)" labelPlacement="stacked" name="category" interface="action-sheet" placeholder="Choose a category" [(ngModel)]="form.category">
                @for (c of categories; track c.value) {
                  <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-textarea label="Description" labelPlacement="stacked" name="description" [autoGrow]="true" rows="4" placeholder="Describe what's wrong, since when, and how it affects classes." [(ngModel)]="form.description" required />
            </ion-item>
          </ion-list>
        </div>

        <div class="section-title">How bad is it?</div>
        <div class="severity-pick" role="radiogroup" aria-label="How bad is it?">
          @for (s of severities; track s.value) {
            <button type="button" role="radio" [attr.aria-checked]="form.severity === s.value"
              [class]="'sev sev-' + s.value" [class.active]="form.severity === s.value" (click)="form.severity = s.value">
              <strong>{{ s.label }}</strong><span>{{ s.hint }}</span>
            </button>
          }
        </div>

        <div class="section-title">Photo</div>
        <div class="panel">
          @if (previewUrl()) {
            <div class="photo-preview">
              <img [src]="previewUrl()" alt="Selected photo" />
            </div>
            <ion-button fill="clear" color="danger" size="small" (click)="clearPhoto()">
              <ion-icon slot="start" name="trash-outline" /> Remove photo
            </ion-button>
          } @else {
            <ion-button expand="block" fill="outline" (click)="choosePhoto()">
              <ion-icon slot="start" name="camera-outline" /> Take or choose a photo
            </ion-button>
          }
        </div>

        <ion-button expand="block" type="submit" [disabled]="saving()">
          @if (saving()) { <ion-spinner name="crescent" /> } @else { Submit report }
        </ion-button>
      </form>
    </ion-content>
  `,
})
export class ReportFormPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  protected auth = inject(AuthService);
  private followUpOf: string | null = null;

  protected inTabs = this.router.url.startsWith('/tabs');
  protected categories = CATEGORIES;
  protected facilities = signal<Facility[]>([]);
  protected buildingId = signal<number | null>(null);
  protected equipment = signal<Equipment[]>([]);
  protected severities = SEVERITIES;
  protected buildings = computed(() => this.facilities().filter((f) => f.type === 'building' || (!f.parent_id && f.type !== 'building')));
  protected standalone = computed(() => this.facilities().filter((f) => !f.parent_id && f.type !== 'building'));
  protected rooms = computed(() => this.facilities().filter((f) => f.parent_id === this.buildingId()));
  protected previewUrl = signal<string | null>(null);
  protected saving = signal(false);

  form = this.blank();
  private photo: Blob | null = null;

  ionViewWillEnter(): void {
    if (!this.facilities().length) {
      this.api.get<Facility[]>('facilities').then(
        (list) => this.facilities.set(list),
        (err) => this.ui.error(err),
      );
    }
    // "Report it again" from a fixed/rejected report: ?followUp=<report id>
    const followUp = this.route.snapshot.queryParamMap.get('followUp');
    if (followUp && followUp !== this.followUpOf) {
      this.followUpOf = followUp;
      void this.prefillFrom(followUp);
    }
  }

  /** Fill the form from an earlier report so the reporter only has to say what is still wrong. */
  private async prefillFrom(id: string): Promise<void> {
    try {
      const old = await this.api.get<Report>(`reports/${id}`);
      const f = old.facility;
      this.buildingId.set(f ? (f.parent_id ?? f.id) : null);
      this.form = {
        title: old.title.startsWith('Still not fixed: ') ? old.title : 'Still not fixed: ' + old.title,
        description: `Follow-up to ${old.reference}. ${old.description}\n\nWhat is still wrong: `,
        facility_id: old.facility_id,
        equipment_id: old.equipment_id,
        location_details: old.location_details ?? '',
        category: old.category ?? '',
        severity: old.severity ?? '',
      };
      this.pickRoom(old.facility_id, true);
      this.cdr.markForCheck();
      await this.ui.toast('Details copied from ' + old.reference + '. Add what is still wrong.');
    } catch (err) {
      await this.ui.error(err);
    }
  }

  pickBuilding(id: number): void {
    this.buildingId.set(id);
    const picked = this.facilities().find((f) => f.id === id);
    // Outdoor areas etc. without a parent are selectable directly.
    this.pickRoom(picked && picked.type !== 'building' ? id : null);
  }

  /** Choosing a room loads the equipment in it, so the requester can say which item is broken. */
  pickRoom(id: number | null, keepEquipment = false): void {
    this.form.facility_id = id;
    if (!keepEquipment) this.form.equipment_id = null;
    this.equipment.set([]);
    if (!id) return;
    this.api.get<Equipment[]>('equipment', { facility_id: id }).then(
      (list) => {
        this.equipment.set(list.filter((e) => e.condition !== 'out_of_service'));
        this.cdr.markForCheck();
      },
      () => undefined,
    );
  }

  async choosePhoto(): Promise<void> {
    const file = await pickPhoto();
    if (!file) return;
    this.photo = await resizeImage(file);
    this.setPreview(URL.createObjectURL(this.photo));
  }

  clearPhoto(): void {
    this.photo = null;
    this.setPreview(null);
  }

  async submit(): Promise<void> {
    if (!this.form.title.trim() || !this.form.description.trim()) {
      await this.ui.toast('Please enter a title and description.', 'warning');
      return;
    }
    if (!this.form.facility_id && !this.form.location_details.trim()) {
      await this.ui.toast('Please choose a location or describe where it is.', 'warning');
      return;
    }

    this.saving.set(true);
    try {
      const report = await this.api.upload<Report>('reports', { ...this.form, photo: this.photo });
      await this.ui.toast(`Report ${report.reference} submitted. Thank you!`, 'success');
      this.form = this.blank();
      this.buildingId.set(null);
      this.equipment.set([]);
      this.clearPhoto();
      this.followUpOf = null;
      await this.router.navigate(['/reports', report.id]);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.saving.set(false);
    }
  }

  private setPreview(url: string | null): void {
    const old = this.previewUrl();
    if (old) URL.revokeObjectURL(old);
    this.previewUrl.set(url);
  }

  private blank() {
    return {
      title: '',
      description: '',
      facility_id: null as number | null,
      equipment_id: null as number | null,
      location_details: '',
      category: '',
      severity: '',
    };
  }
}
