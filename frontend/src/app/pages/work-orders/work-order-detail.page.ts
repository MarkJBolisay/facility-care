import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NavController } from '@ionic/angular';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { pickPhoto, resizeImage } from '../../core/image';
import {
  EQUIPMENT_CONDITIONS,
  REPAIR_STAGES,
  STAGE_ORDER,
  WorkOrder,
  WorkOrderMaterial,
  equipmentIcon,
  labelOf,
  toneOf,
} from '../../core/models';
import { ActivityComponent } from '../../shared/activity';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';
import { CameraService } from '../../shared/camera';
import { RepairTimelineComponent, buildWorkOrderTimeline } from '../../shared/timeline';

@Component({
  selector: 'app-work-order-detail',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe, DecimalPipe, ActivityComponent, RepairTimelineComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.isAdmin() ? '/tabs/work-orders' : '/tabs/tasks'" /></ion-buttons>
        <ion-title>{{ wo()?.reference || 'Work Order' }}</ion-title>
        @if (auth.isAdmin() && wo()) {
          <ion-buttons slot="end">
            <ion-button [routerLink]="['/work-orders', wo()!.id, 'edit']"><ion-icon slot="icon-only" name="create-outline" /></ion-button>
            <ion-button color="danger" (click)="remove()"><ion-icon slot="icon-only" name="trash-outline" /></ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      @if (wo(); as w) {
        <div class="max">
          @if (w.report?.photo_url) {
            <a [href]="w.report.photo_url" target="_blank"><img class="hero-photo" [src]="w.report.photo_url" alt="Reported issue" /></a>
          }

          <!-- Current status -->
          <div class="panel">
            <h2 class="mt-0">{{ w.title }}</h2>
            <div class="pills">
              <app-badge kind="status" [value]="w.status" />
              <app-badge kind="priority" [value]="w.priority" />
              @if (w.type === 'preventive') { <ion-badge color="tertiary" class="pill">Preventive maintenance</ion-badge> }
              <ion-badge color="light" class="pill">{{ w.category | label: 'category' }}</ion-badge>
            </div>
            @if (w.description) { <p class="pre-wrap">{{ w.description }}</p> }
            <dl class="kv">
              <dt>Location</dt>
              <dd>
                @if (w.facility) {
                  <a [routerLink]="['/facilities', w.facility.id]">{{ w.facility.full_name }}</a>
                  @if (w.facility.floor) { <span class="muted"> · {{ w.facility.floor }} floor</span> }
                } @else { — }
                @if (w.report?.location_details) {<br /><span class="muted">{{ w.report.location_details }}</span>}
              </dd>
              <dt>Assigned to</dt>
              <dd>{{ w.assignee?.name || 'Unassigned' }}</dd>
              @if (w.due_date) {<dt>Target date</dt><dd>{{ w.due_date | date: 'MMM d, y' }}</dd>}
              @if (w.report) {
                <dt>From report</dt>
                <dd>
                  <a [routerLink]="['/reports', w.report.id]">{{ w.report.reference }}</a>
                  @if (w.report.reporter) {
                    <br /><span class="muted">{{ w.report.reporter.name }}{{ w.report.reporter.phone ? ' · ' + w.report.reporter.phone : '' }}</span>
                  }
                </dd>
              }
              @if (w.started_at) {<dt>Started</dt><dd>{{ w.started_at | date: 'MMM d, y h:mm a' }}</dd>}
              @if (w.nearing_completion_at) {<dt>Nearing completion</dt><dd>{{ w.nearing_completion_at | date: 'MMM d, y h:mm a' }}</dd>}
              @if (w.completed_at) {<dt>Completed</dt><dd>{{ w.completed_at | date: 'MMM d, y h:mm a' }}</dd>}
            </dl>
          </div>

          <!-- Five-stage indicator -->
          <div class="panel stepper-panel">
            <div class="stepper" aria-label="Repair progress">
              @for (s of stages; track s.value; let i = $index) {
                <div class="step" [class.done]="i < currentIndex()" [class.now]="i === currentIndex()" [class.upcoming]="i > currentIndex()">
                  <span class="step-dot"><ion-icon [name]="i < currentIndex() ? 'checkmark' : s.icon" /></span>
                  <span class="step-label">{{ s.label }}</span>
                </div>
              }
            </div>
            <div class="stage-track"><div class="stage-fill" [style.width.%]="progressPct()"></div></div>
            <p class="stage-caption">
              <strong>{{ stageTitle() }}</strong>
              <span>{{ stageHint() }}</span>
            </p>
          </div>

          @if (w.equipment; as e) {
            <div class="section-title">Equipment</div>
            <ion-list class="cards">
              <ion-item button detail [routerLink]="['/equipment', e.id]">
                <div slot="start" class="eq-icon" [class]="'eq-icon tint-' + conditionTone(e.condition)"><ion-icon [name]="eqIcon(e.category)" /></div>
                <ion-label>
                  <h3>{{ e.name }}</h3>
                  <p>{{ e.code }}{{ e.model ? ' · ' + e.model : '' }}{{ e.serial_number ? ' · S/N ' + e.serial_number : '' }}</p>
                  <div class="pills"><app-badge kind="condition" [value]="e.condition" /></div>
                </ion-label>
              </ion-item>
            </ion-list>
          }

          <!-- Update Repair Status -->
          @if (canWork() && w.status !== 'completed' && w.status !== 'cancelled') {
            <div class="section-title">Update repair status</div>
            <div class="panel stage-form">
              <div class="stage-next">
                <ion-icon [name]="nextStage().icon" />
                <div>
                  <strong>{{ nextStage().label }}</strong>
                  <span>{{ nextStage().hint }}</span>
                </div>
              </div>

              @if (w.status !== 'pending') {
                <ion-textarea
                  label="Actions taken *"
                  labelPlacement="stacked"
                  [autoGrow]="true"
                  rows="3"
                  placeholder="What did you do? (e.g. replaced the broken switch and tested it)"
                  [(ngModel)]="stageForm.actions_taken"
                />
              }

              <ion-textarea
                label="Remarks"
                labelPlacement="stacked"
                [autoGrow]="true"
                rows="2"
                maxlength="1000"
                placeholder="Findings, follow-ups, recommendations"
                [(ngModel)]="stageForm.remarks"
              />
              <div class="counter">{{ stageForm.remarks.length }}/1000</div>

              @if (w.equipment && w.status === 'nearing_completion') {
                <ion-select label="Equipment condition after repair" labelPlacement="stacked" interface="action-sheet" [(ngModel)]="stageForm.condition_after">
                  @for (c of conditionsAfter; track c.value) {
                    <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                  }
                </ion-select>
              }

              @if (w.status === 'nearing_completion' && !materialCount() && !w.no_materials_reason) {
                <p class="note warn"><ion-icon name="information-circle-outline" /> Record the materials used, or tap "No materials used" in the Materials Use card before completing.</p>
              }

              <!-- Required photo proof -->
              <div class="proof">
                @if (stagePhotoPreview(); as preview) {
                  <div class="proof-preview">
                    <img [src]="preview" alt="Photo proof preview" />
                    <div class="proof-actions">
                      <ion-button size="small" fill="outline" (click)="pickStagePhoto('camera')"><ion-icon slot="start" name="camera-outline" /> Retake</ion-button>
                      <ion-button size="small" fill="clear" color="danger" (click)="clearStagePhoto()">Remove</ion-button>
                    </div>
                  </div>
                } @else {
                  <div class="proof-empty">
                    <ion-icon name="camera-outline" />
                    <span>Picture proof is required for this stage</span>
                  </div>
                  <div class="proof-buttons">
                    <ion-button fill="outline" (click)="pickStagePhoto('camera')"><ion-icon slot="start" name="camera-outline" /> Take Photo</ion-button>
                    <ion-button fill="outline" (click)="pickStagePhoto('gallery')"><ion-icon slot="start" name="images-outline" /> Choose from Gallery</ion-button>
                  </div>
                }
              </div>

              <ion-button
                expand="block"
                [color]="w.status === 'nearing_completion' ? 'success' : 'primary'"
                [disabled]="savingStage()"
                (click)="submitStage()"
              >
                @if (savingStage()) { <ion-spinner name="crescent" /> } @else {
                  <ion-icon slot="start" [name]="w.status === 'nearing_completion' ? 'checkmark-circle-outline' : 'arrow-forward-outline'" />
                  {{ actionLabel() }}
                }
              </ion-button>
            </div>
          }

          <!-- Materials Use -->
          <div class="section-title">Materials Use</div>
          <div class="panel">
            <div class="mat-head">
              <div>
                <strong>{{ materialCount() }} {{ materialCount() === 1 ? 'entry' : 'entries' }}</strong>
                <span>{{ w.materials_cost ? ('₱' + (w.materials_cost | number: '1.2-2') + ' total cost') : 'No cost recorded' }}</span>
              </div>
              @if (materialCount()) {
                <ion-button fill="clear" size="small" (click)="viewMaterials.set(!viewMaterials())">
                  {{ viewMaterials() ? 'Hide' : 'View Materials' }}
                </ion-button>
              }
            </div>

            @if (w.no_materials_reason && !materialCount()) {
              <div class="no-materials">
                <ion-icon name="cube-outline" />
                <div><strong>No materials used</strong><span>{{ w.no_materials_reason }}</span></div>
              </div>
            }

            @if (viewMaterials() && materialCount()) {
              <div class="mat-list">
                @for (m of w.materials; track m.id) {
                  <div class="mat-row">
                    @if (m.photo_url) {
                      <a [href]="m.photo_url" target="_blank" class="mat-photo"><img [src]="m.photo_url" alt="Photo of {{ m.name }}" loading="lazy" /></a>
                    } @else {
                      <span class="mat-photo placeholder"><ion-icon [name]="m.type === 'equipment' ? 'construct-outline' : 'cube-outline'" /></span>
                    }
                    <div class="mat-main">
                      <strong>{{ m.name }}</strong>
                      <span>{{ m.quantity }} {{ m.unit }} · {{ m.type === 'equipment' ? 'Equipment' : 'Material' }}</span>
                      @if (m.purpose) { <span class="mat-purpose">{{ m.purpose }}</span> }
                      @if (m.unit_cost) { <span class="mat-purpose">₱{{ m.unit_cost | number: '1.2-2' }} each</span> }
                    </div>
                    @if (canEditMaterials()) {
                      <div class="mat-actions">
                        <ion-button fill="clear" size="small" (click)="editMaterial(m)" aria-label="Edit material"><ion-icon slot="icon-only" name="create-outline" /></ion-button>
                        <ion-button fill="clear" color="danger" size="small" (click)="removeMaterial(m)" aria-label="Remove material"><ion-icon slot="icon-only" name="trash-outline" /></ion-button>
                      </div>
                    }
                  </div>
                }
              </div>
            } @else if (materialCount() === 0 && !w.no_materials_reason) {
              <p class="muted small">Nothing recorded yet.</p>
            }

            @if (canEditMaterials()) {
              <div class="mat-actions-row">
                <ion-button fill="outline" (click)="openMaterialForm()">
                  <ion-icon slot="start" name="add-outline" /> {{ materialForm.id ? 'Edit material' : 'Add material' }}
                </ion-button>
                @if (!materialCount() && !w.no_materials_reason) {
                  <ion-button fill="clear" color="medium" (click)="markNoMaterials()">No materials used</ion-button>
                }
              </div>
            }

            @if (showMaterialForm()) {
              <div class="mat-form">
                <ion-segment [(ngModel)]="materialForm.type">
                  <ion-segment-button value="material"><ion-label>Material</ion-label></ion-segment-button>
                  <ion-segment-button value="equipment"><ion-label>Equipment</ion-label></ion-segment-button>
                </ion-segment>
                <ion-input label="Name *" labelPlacement="stacked" placeholder="e.g. PVC pipe 1/2&quot;" [(ngModel)]="materialForm.name" />
                <ion-row>
                  <ion-col size="4"><ion-input label="Qty *" labelPlacement="stacked" type="number" min="0" [(ngModel)]="materialForm.quantity" /></ion-col>
                  <ion-col size="4"><ion-input label="Unit" labelPlacement="stacked" placeholder="pcs" [(ngModel)]="materialForm.unit" /></ion-col>
                  <ion-col size="4"><ion-input label="Unit cost ₱" labelPlacement="stacked" type="number" min="0" [(ngModel)]="materialForm.unit_cost" /></ion-col>
                </ion-row>
                <ion-textarea label="Purpose / description *" labelPlacement="stacked" [autoGrow]="true" rows="2" placeholder="What was it used for?" [(ngModel)]="materialForm.purpose" />
                @if (materialForm.preview) {
                  <div class="proof-preview">
                    <img [src]="materialForm.preview" alt="Material photo preview" />
                    <div class="proof-actions">
                      <ion-button size="small" fill="clear" color="danger" (click)="clearMaterialPhoto()">Remove photo</ion-button>
                    </div>
                  </div>
                } @else {
                  <div class="proof-buttons">
                    <ion-button fill="outline" size="small" (click)="pickMaterialPhoto('camera')"><ion-icon slot="start" name="camera-outline" /> Take Photo *</ion-button>
                    <ion-button fill="outline" size="small" (click)="pickMaterialPhoto('gallery')"><ion-icon slot="start" name="images-outline" /> Gallery *</ion-button>
                  </div>
                }
                <div class="mat-form-actions">
                  @if (materialForm.id) {
                    <ion-button fill="clear" color="medium" (click)="cancelMaterialForm()">Cancel</ion-button>
                  }
                  <ion-button (click)="saveMaterial()" [disabled]="savingMaterial()">
                    @if (savingMaterial()) { <ion-spinner name="crescent" /> } @else {
                      <ion-icon slot="start" name="save-outline" /> {{ materialForm.id ? 'Save changes' : 'Add material' }}
                    }
                  </ion-button>
                </div>
              </div>
            }
          </div>

          <!-- Progress timeline -->
          <div class="section-title">Progress timeline</div>
          <div class="panel">
            <app-repair-timeline [items]="timeline()" />
          </div>

          @if (w.actions_taken && w.status !== 'completed') {
            <div class="section-title">Work done so far</div>
            <div class="panel"><p class="pre-wrap mt-0">{{ w.actions_taken }}</p></div>
          }

          @if (w.activities?.length) {
            <div class="section-title">Activity log</div>
            <div class="panel"><app-activity [items]="w.activities" /></div>
          }

          @if (auth.isAdmin() && w.status !== 'cancelled' && w.status !== 'completed') {
            <ion-button expand="block" fill="clear" color="danger" (click)="cancel()">Cancel work order</ion-button>
          }
        </div>
      } @else if (loadError()) {
        <app-empty [text]="loadError()" icon="alert-circle-outline" />
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
  styles: [
    `
      /* Five-stage stepper */
      .stepper-panel { padding-bottom: 14px; }
      .stepper { display: flex; justify-content: space-between; gap: 2px; }
      .step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; min-width: 0; }
      .step-dot {
        display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%;
        background: var(--fc-page, #f4f6fa); border: 2px solid var(--fc-line, #e3e9f2);
        color: var(--fc-muted, #7a8394); font-size: 17px;
      }
      .step-label { font-size: 0.64rem; font-weight: 700; letter-spacing: 0.01em; color: var(--fc-muted, #7a8394); line-height: 1.15; }
      .step.done .step-dot { background: var(--ion-color-success, #16a34a); border-color: var(--ion-color-success, #16a34a); color: #fff; }
      .step.done .step-label { color: var(--ion-color-success, #16a34a); }
      .step.now .step-dot {
        background: var(--ion-color-primary, #2160e0); border-color: var(--ion-color-primary, #2160e0); color: #fff;
        box-shadow: 0 0 0 4px rgba(var(--ion-color-primary-rgb, 33, 96, 224), 0.18);
      }
      .step.now .step-label { color: var(--ion-color-primary, #2160e0); }
      .step.upcoming { opacity: 0.55; }
      .stage-track { height: 6px; border-radius: 999px; background: var(--fc-page, #f4f6fa); margin: 14px 0 10px; overflow: hidden; }
      .stage-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--ion-color-primary, #2160e0), var(--ion-color-success, #16a34a)); transition: width 0.3s ease; }
      .stage-caption { margin: 0; display: flex; flex-direction: column; gap: 2px; }
      .stage-caption strong { font-size: 0.92rem; }
      .stage-caption span { font-size: 0.78rem; color: var(--fc-muted, #7a8394); }

      /* Stage form */
      .stage-next {
        display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 10px;
        border-radius: 14px; background: var(--fc-page, #f5f8fd);
      }
      .stage-next ion-icon { font-size: 26px; color: var(--ion-color-primary, #2160e0); flex-shrink: 0; }
      .stage-next div { display: flex; flex-direction: column; }
      .stage-next strong { font-size: 0.95rem; }
      .stage-next span { font-size: 0.78rem; color: var(--fc-muted, #7a8394); }
      .counter { text-align: right; font-size: 0.72rem; color: var(--fc-muted, #7a8394); margin: -4px 4px 8px; }
      .note { display: flex; align-items: flex-start; gap: 6px; font-size: 0.8rem; margin: 8px 0; }
      .note.warn { color: var(--ion-color-warning-shade, #b45309); }

      .proof { margin: 10px 0 14px; }
      .proof-empty {
        display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px;
        border: 1.5px dashed var(--fc-line, #cfd8e6); border-radius: 14px; color: var(--fc-muted, #7a8394); font-size: 0.82rem;
      }
      .proof-empty ion-icon { font-size: 26px; }
      .proof-buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .proof-buttons ion-button { flex: 1 1 160px; margin: 0; }
      .proof-preview img {
        display: block; width: 100%; max-height: 240px; object-fit: cover; border-radius: 14px; border: 1px solid var(--fc-line, #e3e9f2);
      }
      .proof-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }

      /* Materials */
      .mat-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .mat-head div { display: flex; flex-direction: column; }
      .mat-head strong { font-size: 0.95rem; }
      .mat-head span { font-size: 0.76rem; color: var(--fc-muted, #7a8394); }
      .no-materials { display: flex; gap: 10px; padding: 10px 12px; margin-top: 8px; border-radius: 12px; background: var(--fc-page, #f5f8fd); }
      .no-materials ion-icon { font-size: 22px; color: var(--fc-muted, #7a8394); flex-shrink: 0; }
      .no-materials div { display: flex; flex-direction: column; }
      .no-materials strong { font-size: 0.86rem; }
      .no-materials span { font-size: 0.78rem; color: var(--fc-muted, #7a8394); }
      .mat-list { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
      .mat-row { display: flex; align-items: flex-start; gap: 10px; }
      .mat-photo { width: 54px; height: 54px; flex: 0 0 54px; border-radius: 12px; overflow: hidden; border: 1px solid var(--fc-line, #e3e9f2); }
      .mat-photo img { width: 100%; height: 100%; object-fit: cover; }
      .mat-photo.placeholder { display: grid; place-items: center; background: var(--fc-page, #f5f8fd); color: var(--fc-muted, #7a8394); font-size: 22px; }
      .mat-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
      .mat-main strong { font-size: 0.9rem; }
      .mat-main span { font-size: 0.76rem; color: var(--fc-muted, #7a8394); }
      .mat-main .mat-purpose { color: var(--fc-text, #5b6475); }
      .mat-actions { display: flex; flex-shrink: 0; }
      .mat-actions-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .mat-form { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--fc-line, #e3e9f2); }
      .mat-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
    `,
  ],
})
export class WorkOrderDetailPage implements OnDestroy {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private camera = inject(CameraService);
  private router = inject(Router);
  private nav = inject(NavController);
  protected auth = inject(AuthService);

  readonly id = input.required<string>();
  protected loadError = signal('');
  protected wo = signal<WorkOrder | null>(null);
  protected savingStage = signal(false);
  protected savingMaterial = signal(false);
  protected viewMaterials = signal(true);
  protected showMaterialForm = signal(false);

  protected stages = REPAIR_STAGES;
  protected conditionsAfter = EQUIPMENT_CONDITIONS.filter((c) => c.value !== 'under_maintenance');
  protected eqIcon = equipmentIcon;

  protected stageForm = { actions_taken: '', remarks: '', condition_after: 'operational' };
  protected stagePhoto = signal<Blob | null>(null);
  protected stagePhotoPreview = signal<string | null>(null);

  protected materialForm = this.blankMaterial();
  protected materialPhoto = signal<Blob | null>(null);

  private objectUrls: string[] = [];

  protected timeline = computed(() => {
    const w = this.wo();
    return w ? buildWorkOrderTimeline(w) : [];
  });

  protected currentIndex = computed(() => STAGE_ORDER[this.wo()?.status ?? ''] ?? 0);
  protected progressPct = computed(() => (this.currentIndex() / (REPAIR_STAGES.length - 1)) * 100);
  protected stageTitle = computed(() => {
    const w = this.wo();
    if (!w) return '';
    if (w.status === 'cancelled') return 'Cancelled';
    return REPAIR_STAGES[this.currentIndex()]?.label ?? labelOf('status', w.status);
  });
  protected stageHint = computed(() => {
    const w = this.wo();
    if (!w) return '';
    if (w.status === 'cancelled') return 'This work order was cancelled by the admin.';
    return REPAIR_STAGES[this.currentIndex()]?.hint ?? '';
  });
  protected nextStage = computed(() => {
    const w = this.wo();
    const index = (STAGE_ORDER[w?.status ?? ''] ?? 0) + 1;
    return REPAIR_STAGES[Math.min(index, REPAIR_STAGES.length - 1)];
  });
  protected actionLabel = computed(() => {
    const status = this.wo()?.status;
    if (status === 'pending') return 'Start repair';
    if (status === 'in_progress') return 'Mark as nearing completion';
    return 'Complete repair';
  });

  protected materialCount = computed(() => this.wo()?.materials?.length ?? 0);

  protected canWork = computed(() => {
    const w = this.wo();
    const u = this.auth.user();
    if (!w || !u || w.status === 'cancelled') return false;
    return u.role === 'admin' || (u.role === 'maintenance' && w.assigned_to === u.id);
  });
  protected canEditMaterials = computed(() => {
    const status = this.wo()?.status;
    return this.canWork() && (status === 'in_progress' || status === 'nearing_completion');
  });

  protected conditionTone(c: string): string {
    return toneOf('condition', c);
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  ngOnDestroy(): void {
    this.revokeUrls();
  }

  async load(): Promise<void> {
    this.loadError.set('');
    try {
      const w = await this.api.get<WorkOrder>(`work-orders/${this.id()}`);
      this.wo.set(w);
      if (w.status !== 'completed') {
        this.stageForm.actions_taken = w.actions_taken ?? '';
        this.stageForm.remarks = '';
        this.stageForm.condition_after = w.condition_after ?? 'operational';
      }
    } catch (err) {
      this.loadError.set(errorMessage(err));
    }
  }

  /** Take Photo or Choose from Gallery, then keep a local preview. */
  async pickStagePhoto(source: 'camera' | 'gallery'): Promise<void> {
    const file = source === 'camera' ? await this.camera.takePhoto() : await pickPhoto(false);
    if (!file) return;
    this.clearStagePhoto();
    const resized = await resizeImage(file);
    this.stagePhoto.set(resized);
    const url = URL.createObjectURL(resized);
    this.objectUrls.push(url);
    this.stagePhotoPreview.set(url);
  }

  clearStagePhoto(): void {
    this.stagePhoto.set(null);
    this.stagePhotoPreview.set(null);
  }

  async submitStage(): Promise<void> {
    const w = this.wo();
    if (!w) return;
    const photo = this.stagePhoto();
    if (!photo) {
      await this.ui.toast('Add a photo of this stage. Picture proof is required.', 'warning');
      return;
    }
    if (w.status !== 'pending' && !this.stageForm.actions_taken.trim()) {
      await this.ui.toast('Describe the actions taken.', 'warning');
      return;
    }
    if (
      w.status === 'nearing_completion' &&
      !this.materialCount() &&
      !w.no_materials_reason
    ) {
      await this.ui.toast('Record the materials used or choose "No materials used" first.', 'warning');
      return;
    }
    if (w.status === 'nearing_completion') {
      const ok = await this.ui.confirm('Complete repair', 'Are you sure you want to mark this repair as completed?', 'Yes, complete');
      if (!ok) return;
    }

    const next = w.status === 'pending' ? 'in_progress' : w.status === 'in_progress' ? 'nearing_completion' : 'completed';
    this.savingStage.set(true);
    const updated = await this.ui.busy(() =>
      this.api.upload<WorkOrder>(`work-orders/${this.id()}/stage`, {
        stage: next,
        photo,
        actions_taken: w.status === 'pending' ? null : this.stageForm.actions_taken,
        remarks: this.stageForm.remarks,
        condition_after: w.equipment && next === 'completed' ? this.stageForm.condition_after : null,
      }),
    );
    this.savingStage.set(false);
    if (!updated) return;

    this.wo.set(updated);
    this.clearStagePhoto();
    this.stageForm = { actions_taken: updated.actions_taken ?? '', remarks: '', condition_after: updated.condition_after ?? 'operational' };

    if (updated.status === 'completed') {
      await this.ui.toast('Repair completed. The reporter and admin were notified.', 'success');
    } else if (updated.status === 'nearing_completion') {
      await this.ui.toast('Marked as nearing completion. Add the final details to finish.', 'success');
    } else {
      await this.ui.toast('Repair started. Record the materials you use, then mark it nearing completion.', 'success');
    }
  }

  // ----- Materials ---------------------------------------------------------

  openMaterialForm(): void {
    this.materialForm = this.blankMaterial();
    this.showMaterialForm.set(true);
    this.viewMaterials.set(true);
  }

  editMaterial(m: WorkOrderMaterial): void {
    this.clearMaterialPhoto();
    this.materialForm = {
      id: m.id,
      name: m.name,
      type: m.type,
      quantity: m.quantity,
      unit: m.unit ?? '',
      unit_cost: m.unit_cost ?? '',
      purpose: m.purpose ?? '',
      preview: m.photo_url,
    } as typeof this.materialForm;
    this.showMaterialForm.set(true);
    this.viewMaterials.set(true);
  }

  cancelMaterialForm(): void {
    this.materialForm = this.blankMaterial();
    this.showMaterialForm.set(false);
  }

  async pickMaterialPhoto(source: 'camera' | 'gallery'): Promise<void> {
    const file = source === 'camera' ? await this.camera.takePhoto() : await pickPhoto(false);
    if (!file) return;
    const resized = await resizeImage(file);
    this.materialPhoto.set(resized);
    const url = URL.createObjectURL(resized);
    this.objectUrls.push(url);
    this.materialForm.preview = url;
  }

  clearMaterialPhoto(): void {
    this.materialPhoto.set(null);
    this.materialForm.preview = null;
  }

  async saveMaterial(): Promise<void> {
    const f = this.materialForm;
    if (!f.name.trim() || !(Number(f.quantity) > 0)) {
      await this.ui.toast('Enter a material name and quantity.', 'warning');
      return;
    }
    if (!f.purpose.trim()) {
      await this.ui.toast('Describe what the material was used for.', 'warning');
      return;
    }
    if (!this.materialPhoto() && !f.id) {
      await this.ui.toast('Add a photo of the material. Picture proof is required.', 'warning');
      return;
    }

    this.savingMaterial.set(true);
    const saved = await this.ui.busy(() =>
      this.api.upload<WorkOrderMaterial>(
        f.id ? `work-orders/${this.id()}/materials/${f.id}` : `work-orders/${this.id()}/materials`,
        {
          name: f.name.trim(),
          type: f.type,
          quantity: f.quantity,
          unit: f.unit,
          unit_cost: f.unit_cost === '' ? null : f.unit_cost,
          purpose: f.purpose.trim(),
          photo: this.materialPhoto(),
        },
      ),
    );
    this.savingMaterial.set(false);
    if (!saved) return;
    this.materialForm = this.blankMaterial();
    this.materialPhoto.set(null);
    this.showMaterialForm.set(false);
    await this.load();
    await this.ui.toast(f.id ? 'Material updated.' : 'Material recorded.', 'success');
  }

  async removeMaterial(m: WorkOrderMaterial): Promise<void> {
    if (!(await this.ui.confirm('Remove material', `Remove "${m.name}"?`, 'Remove', true))) return;
    const ok = await this.ui.busy(() => this.api.delete(`work-order-materials/${m.id}`).then(() => true));
    if (ok) await this.load();
  }

  async markNoMaterials(): Promise<void> {
    const reason = await this.ui.prompt('No materials used', 'Explain why no materials were needed (required)', 'Save');
    if (reason === null) return;
    if (reason.trim().length < 5) {
      await this.ui.toast('Please explain why no materials were used.', 'warning');
      return;
    }
    const updated = await this.ui.busy(() => this.api.post<WorkOrder>(`work-orders/${this.id()}/no-materials`, { reason }));
    if (updated) {
      this.wo.set(updated);
      await this.ui.toast('Saved. No materials were used for this repair.', 'success');
    }
  }

  // ----- Admin -------------------------------------------------------------

  async cancel(): Promise<void> {
    if (!(await this.ui.confirm('Cancel work order', 'The assigned personnel will be notified.', 'Cancel work order', true))) return;
    const w = await this.ui.busy(() => this.api.put<WorkOrder>(`work-orders/${this.id()}`, { status: 'cancelled' }));
    if (w) this.wo.set(w);
  }

  async remove(): Promise<void> {
    if (!(await this.ui.confirm('Delete work order', 'Photos and materials will also be deleted.', 'Delete', true))) return;
    const ok = await this.ui.busy(() => this.api.delete(`work-orders/${this.id()}`).then(() => true));
    if (ok) await this.router.navigateByUrl('/tabs/work-orders', { replaceUrl: true });
  }

  private blankMaterial() {
    return {
      id: null as number | null,
      name: '',
      type: 'material' as 'material' | 'equipment',
      quantity: 1 as number | string,
      unit: '',
      unit_cost: '' as number | string,
      purpose: '',
      preview: null as string | null,
    };
  }

  private revokeUrls(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls = [];
  }
}
