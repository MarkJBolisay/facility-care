import { Location } from '@angular/common';
import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { pickPhoto, resizeImage } from '../../core/image';
import { CATEGORIES, Equipment, Facility, Report, labelOf } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { CameraService } from '../../shared/camera';

const STEP_NAMES = ['Details', 'Photo', 'Review'];
/** Value of the "Others" choice in the Building and Room / Area lists. */
const OTHER = -1;
const MAX_DETAILS = 300;

const SEVERITY_CARDS = [
  { value: 'minor', label: 'Minor', hint: 'Still usable', icon: 'build-outline' },
  { value: 'moderate', label: 'Moderate', hint: 'Needs attention', icon: 'alert-circle-outline' },
  { value: 'severe', label: 'Severe', hint: 'Unusable / Immediate repair', icon: 'warning-outline' },
];

/**
 * "Report an Issue": three steps (Details → Photo → Review), full screen without the tab bar.
 * Phone: one column. Laptop (900px+): the details step uses two columns so it fits without scrolling.
 */
@Component({
  selector: 'app-report-form',
  imports: [...IONIC, FormsModule],
  template: `
    <ion-header class="rp-head-wrap">
      <div class="rp-head rp-head-rich">
        <!-- decoration on the right: building outline and the yellow swoosh -->
        <svg class="rp-head-art" viewBox="0 0 360 96" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
          <g fill="#ffffff" fill-opacity="0.14">
            <path d="M150 96V34l46-22 46 22v62z" />
            <path d="M232 96V46h60v50z" fill-opacity="0.1" />
          </g>
          <g fill="#ffffff" fill-opacity="0.22">
            <rect x="166" y="44" width="10" height="9" /><rect x="186" y="44" width="10" height="9" /><rect x="206" y="44" width="10" height="9" /><rect x="226" y="44" width="10" height="9" />
            <rect x="166" y="60" width="10" height="9" /><rect x="186" y="60" width="10" height="9" /><rect x="206" y="60" width="10" height="9" /><rect x="226" y="60" width="10" height="9" />
            <rect x="166" y="76" width="10" height="9" /><rect x="186" y="76" width="10" height="9" /><rect x="206" y="76" width="10" height="9" /><rect x="226" y="76" width="10" height="9" />
            <rect x="248" y="58" width="9" height="8" /><rect x="266" y="58" width="9" height="8" /><rect x="248" y="74" width="9" height="8" /><rect x="266" y="74" width="9" height="8" />
          </g>
          <path d="M210 96C268 86 318 58 360 4v20C326 66 282 90 236 96z" fill="#f5c518" />
          <path d="M248 96C300 88 336 66 360 38v12C340 72 310 90 272 96z" fill="#ffffff" fill-opacity="0.85" />
        </svg>
        <div class="rp-head-in">
          <button type="button" class="rp-head-back" aria-label="Back" (click)="headerBack()">
            <ion-icon name="arrow-back-outline" />
          </button>
          <span class="rp-head-icon" aria-hidden="true"><ion-icon name="megaphone-outline" /></span>
          <div class="rp-head-text">
            <h1>Report an Issue</h1>
            <p>Report facility or equipment issues for maintenance.</p>
          </div>
        </div>
      </div>
    </ion-header>

    <ion-content class="rp rp-sheeted">
      <div class="rp-page rp-wizard">
        <ol class="rp-steps" aria-label="Steps">
          @for (name of stepNames; track name; let i = $index) {
            <li [class.done]="i < step()" [class.now]="i === step()" [attr.aria-current]="i === step() ? 'step' : null">
              <span class="rp-step-dot">
                @if (i < step()) { <ion-icon name="checkmark" /> } @else { {{ i + 1 }} }
              </span>
              <em>{{ name }}</em>
            </li>
          }
        </ol>

        @switch (step()) {
          @case (0) {
            <div class="rp-sheet">
              <div class="rp-title">
                <span class="rp-title-icon" aria-hidden="true"><ion-icon name="document-text-outline" /></span>
                <div>
                  <h2 class="rp-h">Issue Details</h2>
                  <p class="rp-p">Provide the details of the problem you want to report.</p>
                </div>
              </div>
              <div class="rp-form">
                <div class="rp-form-col">
                  <label class="rp-label" for="rf-title"><ion-icon name="build-outline" />What's the problem? <b>*</b></label>
                  <input id="rf-title" class="rp-input" name="title" maxlength="255" placeholder="e.g., Broken chair, Leaking faucet" [(ngModel)]="form.title" />

                  <!-- "Others": the reporter types the place (on a laptop the box sits beside the list) -->
                  <div class="rp-cat-row" [class.split]="buildingId() === OTHER">
                    <div>
                      <label class="rp-label" for="rf-building"><ion-icon name="business-outline" />Building <b>*</b></label>
                      <div class="rp-select">
                        <select id="rf-building" name="building" [ngModel]="buildingId()" (ngModelChange)="pickBuilding($event)">
                          <option [ngValue]="null" disabled>Select building</option>
                          @for (b of buildings(); track b.id) {
                            <option [ngValue]="b.id">{{ b.name }}</option>
                          }
                          <option [ngValue]="OTHER">Others</option>
                        </select>
                        <ion-icon name="chevron-down-outline" class="rp-select-chev" />
                      </div>
                    </div>
                    @if (buildingId() === OTHER) {
                      <div>
                        <label class="rp-label" for="rf-building-other">Building name <b>*</b></label>
                        <input id="rf-building-other" class="rp-input" name="building_other" maxlength="100"
                          placeholder="e.g., New Annex Building" [(ngModel)]="form.building_other" />
                      </div>
                    }
                  </div>

                  @if (buildingId() === OTHER) {
                    <label class="rp-label" for="rf-room-typed"><ion-icon name="location-outline" />Room / Area <b>*</b></label>
                    <input id="rf-room-typed" class="rp-input" name="room_typed" maxlength="100"
                      placeholder="e.g., Room 204, Hallway, Canteen" [(ngModel)]="form.room_other" />
                  } @else {
                    <div class="rp-cat-row" [class.split]="form.facility_id === OTHER">
                      <div>
                        <label class="rp-label" for="rf-room"><ion-icon name="location-outline" />Room / Area <b>*</b></label>
                        <div class="rp-select" [class.disabled]="!buildingId()">
                          <select id="rf-room" name="room" [disabled]="!buildingId()" [ngModel]="form.facility_id" (ngModelChange)="pickRoom($event)">
                            <option [ngValue]="null" disabled>Select room or area</option>
                            @for (f of roomOptions(); track f.id) {
                              <option [ngValue]="f.id">{{ f.name }}</option>
                            }
                            <option [ngValue]="OTHER">Others</option>
                          </select>
                          <ion-icon name="chevron-down-outline" class="rp-select-chev" />
                        </div>
                      </div>
                      @if (form.facility_id === OTHER) {
                        <div>
                          <label class="rp-label" for="rf-room-other">Room / Area name <b>*</b></label>
                          <input id="rf-room-other" class="rp-input" name="room_other" maxlength="100"
                            placeholder="e.g., Room 204, Hallway" [(ngModel)]="form.room_other" />
                        </div>
                      }
                    </div>
                  }

                  @if (equipment().length) {
                    <label class="rp-label" for="rf-equipment"><ion-icon name="desktop-outline" />Equipment <i>(optional)</i></label>
                    <div class="rp-select">
                      <select id="rf-equipment" name="equipment" [(ngModel)]="form.equipment_id">
                        <option [ngValue]="null">Not a specific equipment</option>
                        @for (e of equipment(); track e.id) {
                          <option [ngValue]="e.id">{{ e.name }} ({{ e.code }})</option>
                        }
                      </select>
                      <ion-icon name="chevron-down-outline" class="rp-select-chev" />
                    </div>
                    <!-- someone already reported this item and it is not fixed yet -->
                    @if (alreadyReported(); as open) {
                      <div class="rp-dup" role="status">
                        <ion-icon name="warning-outline" aria-hidden="true" />
                        <p>
                          <strong>This item is already reported</strong>
                          {{ open.reference }} · {{ label('status', open.status) }}. If it is the same problem, you don't need to report it
                          again. If it is a different problem, you can still continue.
                        </p>
                      </div>
                    }
                  }

                  <!-- on a laptop "Please specify" sits next to Category so the form still fits -->
                  <div class="rp-cat-row" [class.split]="form.category === 'others'">
                    <div>
                      <label class="rp-label" for="rf-category"><ion-icon name="layers-outline" />Category <b>*</b></label>
                      <div class="rp-select has-icon">
                        <ion-icon name="grid-outline" class="rp-select-icon" />
                        <select id="rf-category" name="category" [(ngModel)]="form.category">
                          <option value="" disabled>Select category</option>
                          @for (c of categories; track c.value) {
                            <option [value]="c.value">{{ c.label }}</option>
                          }
                        </select>
                        <ion-icon name="chevron-down-outline" class="rp-select-chev" />
                      </div>
                    </div>
                    @if (form.category === 'others') {
                      <div>
                        <label class="rp-label" for="rf-other">Please specify <b>*</b></label>
                        <input id="rf-other" class="rp-input" name="category_other" maxlength="100"
                          placeholder="e.g., Broken window blinds" [(ngModel)]="form.category_other" />
                      </div>
                    }
                  </div>
                </div>

                <div class="rp-form-col">
                  <span class="rp-label"><ion-icon name="warning-outline" />Severity <b>*</b></span>
                  <div class="rp-sev" role="radiogroup" aria-label="Severity">
                    @for (s of severityCards; track s.value) {
                      <button type="button" role="radio" [class]="'rp-sev-' + s.value" [class.active]="form.severity === s.value"
                        [attr.aria-checked]="form.severity === s.value" (click)="form.severity = s.value">
                        @if (form.severity === s.value) { <span class="rp-sev-check"><ion-icon name="checkmark" /></span> }
                        <ion-icon [name]="s.icon" />
                        <strong>{{ s.label }}</strong>
                        <small>{{ s.hint }}</small>
                      </button>
                    }
                  </div>

                  <label class="rp-label" for="rf-details"><ion-icon name="chatbox-ellipses-outline" />Notes <i>(optional)</i></label>
                  <textarea id="rf-details" class="rp-input rp-textarea" name="description" [maxlength]="maxDetails"
                    placeholder="Add more details about the issue (e.g., location, condition, or other information)..." [(ngModel)]="form.description"></textarea>
                  <div class="rp-count"><b>{{ form.description.length }}</b> / {{ maxDetails }}</div>
                </div>
              </div>
            </div>
          }

          @case (1) {
            <div class="rp-title">
              <span class="rp-title-icon" aria-hidden="true"><ion-icon name="image-outline" /></span>
              <div>
                <h2 class="rp-h">Add Photo</h2>
                <p class="rp-p">Attach a clear photo of the issue (optional but highly recommended).</p>
              </div>
            </div>
            <div class="rp-photo">
              <!-- the chosen photo fills the box; tap it to take another -->
              <div class="rp-drop-wrap">
                @if (previewUrl()) {
                  <button type="button" class="rp-drop has-photo" (click)="choosePhoto(true)">
                    <img [src]="previewUrl()" alt="Selected photo" />
                    <span class="rp-drop-retake"><ion-icon name="camera-outline" />Retake</span>
                  </button>
                  <button type="button" class="rp-drop-x" aria-label="Remove photo" (click)="clearPhoto()"><ion-icon name="close" /></button>
                } @else {
                  <div class="rp-drop" (click)="choosePhoto(true)">
                    <svg class="rp-drop-art" viewBox="0 0 150 104" aria-hidden="true">
                      <rect x="6" y="22" width="78" height="60" rx="10" transform="rotate(-12 45 52)" fill="#8fb4f8" />
                      <rect x="34" y="18" width="84" height="64" rx="10" fill="#ffffff" stroke="#1565f0" stroke-width="5" />
                      <rect x="42" y="26" width="68" height="48" rx="5" fill="#a9c6fb" />
                      <path d="M42 74l20-22 14 14 10-9 24 17z" fill="#4f8cf5" />
                      <circle cx="94" cy="40" r="7" fill="#1565f0" />
                      <circle cx="116" cy="80" r="17" fill="#1565f0" />
                      <path d="M116 71v18M107 80h18" stroke="#fff" stroke-width="4" stroke-linecap="round" />
                      <path d="M124 6l-3 12M140 14l-10 8M146 32l-13 2" stroke="#1565f0" stroke-width="4" stroke-linecap="round" />
                    </svg>
                    <strong>Tap to add a photo</strong>
                    <span>or choose from your device</span>
                    <div class="rp-drop-btns">
                      <button type="button" class="rp-drop-btn primary" (click)="$event.stopPropagation(); choosePhoto(true)">
                        <ion-icon name="camera-outline" />Take Photo
                      </button>
                      <button type="button" class="rp-drop-btn" (click)="$event.stopPropagation(); choosePhoto(false)">
                        <ion-icon name="images-outline" />Choose from Gallery
                      </button>
                    </div>
                    <small>Supports: JPG, PNG <i>|</i> Max size: 8 MB</small>
                  </div>
                }
              </div>

              <div class="rp-opts">
                <h3>Photo Options</h3>
                <button type="button" class="rp-opt" (click)="choosePhoto(true)">
                  <span class="rp-opt-icon"><ion-icon name="camera-outline" /></span>
                  <span class="rp-opt-text"><strong>Camera</strong><small>Take a new photo</small></span>
                  <ion-icon name="chevron-forward-outline" class="rp-opt-chev" />
                </button>
                <button type="button" class="rp-opt" (click)="choosePhoto(false)">
                  <span class="rp-opt-icon"><ion-icon name="images-outline" /></span>
                  <span class="rp-opt-text"><strong>Gallery</strong><small>Select from your device</small></span>
                  <ion-icon name="chevron-forward-outline" class="rp-opt-chev" />
                </button>
                <button type="button" class="rp-opt rp-opt-danger" (click)="clearPhoto()" [disabled]="!previewUrl()">
                  <span class="rp-opt-icon"><ion-icon name="trash-outline" /></span>
                  <span class="rp-opt-text"><strong>Clear</strong><small>Remove selected photo</small></span>
                  <ion-icon name="chevron-forward-outline" class="rp-opt-chev" />
                </button>
              </div>
            </div>
          }

          @case (2) {
            <div class="rp-title">
              <span class="rp-title-icon" aria-hidden="true"><ion-icon name="clipboard-outline" /></span>
              <div>
                <h2 class="rp-h">Review Report</h2>
                <p class="rp-p">Please review the details before submitting your report.</p>
              </div>
            </div>
            <div class="rp-review">
              <section class="rp-rcard">
                <h3 class="rp-rcard-h"><ion-icon name="information-circle-outline" />Report Details</h3>
                <div class="rp-review-rows">
                  <div class="rp-row"><ion-icon name="build-outline" /><div><span>Problem</span><strong>{{ form.title }}</strong></div></div>
                  <div class="rp-row"><ion-icon name="business-outline" /><div><span>Building</span><strong>{{ buildingName() }}</strong></div></div>
                  <div class="rp-row"><ion-icon name="location-outline" /><div><span>Room / Area</span><strong>{{ roomName() }}</strong></div></div>
                  <div class="rp-row"><ion-icon name="layers-outline" /><div><span>Category</span><strong>{{ label('category', form.category) }}{{ form.category === 'others' && form.category_other.trim() ? ': ' + form.category_other.trim() : '' }}</strong></div></div>
                  @if (equipmentName(); as eq) {
                    <div class="rp-row"><ion-icon name="desktop-outline" /><div><span>Equipment</span><strong>{{ eq }}</strong></div></div>
                  }
                  <div class="rp-row">
                    <ion-icon name="warning-outline" />
                    <div><span>Severity</span><em [class]="'rp-sev-tag rp-sev-tag-' + form.severity"><i class="rp-dot"></i>{{ label('severity', form.severity) }}</em></div>
                  </div>
                  <div class="rp-row rp-row-wide"><ion-icon name="document-text-outline" /><div><span>Notes</span><strong class="rp-row-text">{{ form.description.trim() || 'No notes' }}</strong></div></div>
                </div>
              </section>
              <section class="rp-rcard rp-rcard-photo">
                <h3 class="rp-rcard-h"><ion-icon name="image-outline" />Attached Photo</h3>
                @if (previewUrl()) {
                  <img [src]="previewUrl()" alt="Attached photo" />
                } @else {
                  <div class="rp-nophoto"><ion-icon name="image-outline" />No photo attached</div>
                }
              </section>
            </div>
          }
        }

        @if (error()) {
          <p class="rp-error" role="alert"><ion-icon name="alert-circle-outline" />{{ error() }}</p>
        }
      </div>
    </ion-content>

    <ion-footer class="rp-foot">
      <div class="rp-foot-in">
        <button type="button" class="rp-btn rp-btn-ghost" (click)="step() > 0 ? back() : headerBack()"><ion-icon name="arrow-back-outline" />Back</button>
        @if (step() < 2) {
          <button type="button" class="rp-btn rp-btn-primary" (click)="next()">Next <ion-icon name="arrow-forward-outline" /></button>
        } @else {
          <button type="button" class="rp-btn rp-btn-primary" [disabled]="saving()" (click)="submit()">
            @if (saving()) { <ion-spinner name="crescent" /> } @else { <ion-icon name="send-outline" />Submit Report }
          </button>
        }
      </div>
    </ion-footer>
  `,
})
export class ReportFormPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private location = inject(Location);
  private cdr = inject(ChangeDetectorRef);
  private camera = inject(CameraService);
  protected auth = inject(AuthService);
  private followUpOf: string | null = null;

  protected readonly stepNames = STEP_NAMES;
  protected readonly OTHER = OTHER;
  protected readonly severityCards = SEVERITY_CARDS;
  protected readonly maxDetails = MAX_DETAILS;
  protected readonly categories = CATEGORIES;
  protected step = signal(0);
  protected error = signal('');

  protected facilities = signal<Facility[]>([]);
  protected buildingId = signal<number | null>(null);
  protected equipment = signal<Equipment[]>([]);
  protected buildings = computed(() => this.facilities().filter((f) => !f.parent_id));
  /** A building lists its rooms; a place without rooms yet (e.g. parking area) lists itself so it can still be picked. */
  protected roomOptions = computed(() => {
    const picked = this.facilities().find((f) => f.id === this.buildingId());
    if (!picked) return [];
    const rooms = this.facilities().filter((f) => f.parent_id === picked.id);
    if (!rooms.length) return [{ id: picked.id, name: picked.name }];
    return rooms.map((f) => ({ id: f.id, name: f.name + (f.floor ? ` (${f.floor} floor)` : '') }));
  });
  protected previewUrl = signal<string | null>(null);
  protected saving = signal(false);

  form = this.blank();
  private photo: Blob | null = null;

  protected label = labelOf;

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

  protected buildingName(): string {
    if (this.buildingId() === OTHER) return this.form.building_other.trim() || '—';
    return this.facilities().find((f) => f.id === this.buildingId())?.name ?? '—';
  }

  protected roomName(): string {
    if (this.buildingId() === OTHER || this.form.facility_id === OTHER) return this.form.room_other.trim() || '—';
    return this.roomOptions().find((r) => r.id === this.form.facility_id)?.name ?? '—';
  }

  /** Where the report is saved: a facility from the list and/or the place the reporter typed. */
  private place(): { facility_id: number | null; location_details: string } {
    const f = this.form;
    if (this.buildingId() === OTHER) {
      return { facility_id: null, location_details: `${f.building_other.trim()} – ${f.room_other.trim()}` };
    }
    if (f.facility_id === OTHER) {
      return { facility_id: this.buildingId(), location_details: f.room_other.trim() };
    }
    return { facility_id: f.facility_id, location_details: f.location_details.trim() };
  }

  /** The unfixed request about the chosen equipment, if someone already reported it. */
  protected alreadyReported() {
    return this.equipment().find((x) => x.id === this.form.equipment_id)?.open_report ?? null;
  }

  protected equipmentName(): string | null {
    const e = this.equipment().find((x) => x.id === this.form.equipment_id);
    return e ? `${e.name} (${e.code})` : null;
  }

  /** Fill the form from an earlier report so the reporter only has to say what is still wrong. */
  private async prefillFrom(id: string): Promise<void> {
    try {
      const old = await this.api.get<Report>(`reports/${id}`);
      const f = old.facility;
      const typed = old.location_details ?? '';
      // a place typed under "Others" comes back into the "Others" boxes
      const typedBuilding = !f && !!typed;
      const typedRoom = !!f && !f.parent_id && !!typed;
      this.buildingId.set(typedBuilding ? OTHER : f ? (f.parent_id ?? f.id) : null);
      const [bName, ...rest] = typed.split(' – ');
      this.form = {
        title: old.title.startsWith('Still not fixed: ') ? old.title : 'Still not fixed: ' + old.title,
        description: `Follow-up to ${old.reference}. Still wrong: `,
        facility_id: typedBuilding ? null : typedRoom ? OTHER : old.facility_id,
        equipment_id: old.equipment_id,
        location_details: typedBuilding || typedRoom ? '' : typed,
        building_other: typedBuilding ? bName : '',
        room_other: typedBuilding ? rest.join(' – ') : typedRoom ? typed : '',
        category: old.category ?? '',
        category_other: old.category_other ?? '',
        severity: old.severity ?? '',
      };
      if (!typedBuilding && !typedRoom) this.pickRoom(old.facility_id, true);
      this.step.set(0);
      this.cdr.markForCheck();
      await this.ui.toast('Details copied from ' + old.reference + '. Add what is still wrong.');
    } catch (err) {
      await this.ui.error(err);
    }
  }

  pickBuilding(id: number): void {
    this.buildingId.set(id);
    if (id === OTHER) {
      this.pickRoom(null);
      return;
    }
    const options = this.roomOptions();
    // a place without rooms is picked right away
    this.pickRoom(options.length === 1 ? options[0].id : null);
  }

  /** Choosing a room loads the equipment in it, so the reporter can say which item is broken. */
  pickRoom(id: number | null, keepEquipment = false): void {
    this.form.facility_id = id;
    if (!keepEquipment) this.form.equipment_id = null;
    this.equipment.set([]);
    if (!id || id === OTHER) return;
    this.api.get<Equipment[]>('equipment', { facility_id: id }).then(
      (list) => {
        this.equipment.set(list.filter((e) => e.condition !== 'out_of_service'));
        this.cdr.markForCheck();
      },
      () => undefined,
    );
  }

  async choosePhoto(camera: boolean): Promise<void> {
    const file = camera ? await this.camera.takePhoto() : await pickPhoto(false);
    if (!file) return;
    this.photo = await resizeImage(file);
    this.setPreview(URL.createObjectURL(this.photo));
  }

  clearPhoto(): void {
    this.photo = null;
    this.setPreview(null);
  }

  /** What is still missing on the details step, or '' when it is complete. */
  private missingDetails(): string {
    const f = this.form;
    if (!f.title.trim()) return "Please say what the problem is.";
    if (!this.buildingId()) return 'Please select the building.';
    if (this.buildingId() === OTHER && !f.building_other.trim()) return 'Please write the name of the building.';
    if (this.buildingId() !== OTHER && !f.facility_id) return 'Please select the room or area.';
    if ((this.buildingId() === OTHER || f.facility_id === OTHER) && !f.room_other.trim()) return 'Please write the room or area.';
    if (!f.category) return 'Please select a category.';
    if (f.category === 'others' && !f.category_other.trim()) return 'Please write what kind of problem it is.';
    if (!f.severity) return 'Please choose how severe it is.';
    return '';
  }

  next(): void {
    if (this.step() === 0) {
      const missing = this.missingDetails();
      if (missing) {
        this.error.set(missing);
        return;
      }
    }
    this.error.set('');
    this.step.set(Math.min(2, this.step() + 1));
  }

  back(): void {
    this.error.set('');
    this.step.set(Math.max(0, this.step() - 1));
  }

  /** Header arrow: previous step, or leave the wizard on the first step. */
  headerBack(): void {
    if (this.step() > 0) {
      this.back();
    } else if (window.history.length > 1) {
      this.location.back();
    } else {
      void this.router.navigateByUrl(this.auth.homeUrl());
    }
  }

  async submit(): Promise<void> {
    const missing = this.missingDetails();
    if (missing) {
      this.step.set(0);
      this.error.set(missing);
      return;
    }
    this.saving.set(true);
    try {
      const f = this.form;
      const report = await this.api.upload<Report>('reports', {
        ...this.place(),
        title: f.title.trim(),
        description: f.description.trim(),
        equipment_id: f.equipment_id,
        category: f.category,
        category_other: f.category === 'others' ? f.category_other.trim() : '',
        severity: f.severity,
        photo: this.photo,
      });
      await this.ui.toast(`Report ${report.reference} submitted. Thank you!`, 'success');
      this.form = this.blank();
      this.buildingId.set(null);
      this.equipment.set([]);
      this.clearPhoto();
      this.step.set(0);
      this.followUpOf = null;
      await this.router.navigate(['/reports', report.id], { replaceUrl: true });
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
      building_other: '',
      room_other: '',
      category: '',
      category_other: '',
      severity: '',
    };
  }
}
