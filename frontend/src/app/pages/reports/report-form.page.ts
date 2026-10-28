import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { pickPhoto, resizeImage } from '../../core/image';
import { CATEGORIES, Facility, Report } from '../../core/models';
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
              <ion-select label="Room / Area" labelPlacement="stacked" name="facility" interface="action-sheet" placeholder="Select room, lab or area" [(ngModel)]="form.facility_id" [disabled]="!buildingId() && !standalone().length">
                @if (buildingId()) {
                  <ion-select-option [value]="buildingId()">Whole building / common area</ion-select-option>
                }
                @for (f of rooms(); track f.id) {
                  <ion-select-option [value]="f.id">{{ f.name }}{{ f.floor ? ' (' + f.floor + ' floor)' : '' }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
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
  protected auth = inject(AuthService);

  protected inTabs = this.router.url.startsWith('/tabs');
  protected categories = CATEGORIES;
  protected facilities = signal<Facility[]>([]);
  protected buildingId = signal<number | null>(null);
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
  }

  pickBuilding(id: number): void {
    this.buildingId.set(id);
    const picked = this.facilities().find((f) => f.id === id);
    // Outdoor areas etc. without a parent are selectable directly.
    this.form.facility_id = picked && picked.type !== 'building' ? id : null;
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
      this.clearPhoto();
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
      location_details: '',
      category: '',
    };
  }
}
