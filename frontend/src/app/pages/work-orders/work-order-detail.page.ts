import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NavController } from '@ionic/angular';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { pickPhoto, resizeImage } from '../../core/image';
import { EQUIPMENT_CONDITIONS, WorkOrder, WorkOrderMaterial, WorkOrderPhoto, equipmentIcon, toneOf } from '../../core/models';
import { ActivityComponent } from '../../shared/activity';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';
import { CameraService } from '../../shared/camera';

@Component({
  selector: 'app-work-order-detail',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe, DecimalPipe, NgTemplateOutlet, ActivityComponent],
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

          <div class="panel">
            <h2 class="mt-0">{{ w.title }}</h2>
            <div class="pills">
              <app-badge kind="status" [value]="w.status" />
              <app-badge kind="priority" [value]="w.priority" />
              @if (w.type === 'preventive') { <ion-badge color="tertiary" class="pill">Preventive maintenance</ion-badge> }
              <ion-badge color="light" class="pill">{{ w.category | label: 'category' }}</ion-badge>
            </div>
            @if (w.description) {
              <p class="pre-wrap">{{ w.description }}</p>
            }
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
              @if (w.completed_at) {<dt>Completed</dt><dd>{{ w.completed_at | date: 'MMM d, y h:mm a' }}</dd>}
            </dl>
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

          <!-- Maintenance personnel: guided repair steps -->
          @if (guided()) {
            <div class="section-title">Repair steps</div>
            <div class="rsteps">
              <!-- 1. Start -->
              <div class="rstep" [class.done]="started()" [class.now]="step() === 1">
                <div class="rstep-head">
                  <i>@if (started()) {✓} @else {1}</i>
                  <div>
                    <strong>Start the repair</strong>
                    <span>Tap this when you are at the location and begin working.</span>
                  </div>
                </div>
                <div class="rstep-body">
                  @if (!started()) {
                    <ion-button expand="block" (click)="setStatus('in_progress')">
                      <ion-icon slot="start" name="play-outline" /> Start repair
                    </ion-button>
                  } @else {
                    <p class="rstep-note">
                      Started {{ w.started_at | date: 'MMM d, h:mm a' }} ·
                      <button type="button" class="link-btn" (click)="setStatus('pending')">Move back to pending</button>
                    </p>
                  }
                </div>
              </div>

              <!-- 2. Before photos -->
              <div class="rstep" [class.done]="started() && beforePhotos().length > 0" [class.now]="step() === 2" [class.locked]="!started()">
                <div class="rstep-head">
                  <i>@if (started() && beforePhotos().length) {✓} @else {2}</i>
                  <div>
                    <strong>Take a "before" photo</strong>
                    <span>Show the problem before you fix it.</span>
                  </div>
                </div>
                @if (started()) {
                  <div class="rstep-body">
                    <ng-container [ngTemplateOutlet]="photoGrid" [ngTemplateOutletContext]="{ $implicit: 'before' }" />
                  </div>
                }
              </div>

              <!-- 3. Materials -->
              <div class="rstep" [class.done]="started() && !!w.materials?.length" [class.locked]="!started()">
                <div class="rstep-head">
                  <i>@if (started() && w.materials?.length) {✓} @else {3}</i>
                  <div>
                    <strong>Record materials &amp; equipment <em>(optional)</em></strong>
                    <span>Parts you used and tools you needed.</span>
                  </div>
                </div>
                @if (started()) {
                  <div class="rstep-body"><ng-container [ngTemplateOutlet]="materialsBlock" /></div>
                }
              </div>

              <!-- 4. After photos -->
              <div class="rstep" [class.done]="started() && afterPhotos().length > 0" [class.now]="step() === 4" [class.locked]="!started()">
                <div class="rstep-head">
                  <i>@if (started() && afterPhotos().length) {✓} @else {4}</i>
                  <div>
                    <strong>Take an "after" photo</strong>
                    <span>Show that it is fixed.</span>
                  </div>
                </div>
                @if (started()) {
                  <div class="rstep-body">
                    <ng-container [ngTemplateOutlet]="photoGrid" [ngTemplateOutletContext]="{ $implicit: 'after' }" />
                  </div>
                }
              </div>

              <!-- 5. Completion report -->
              <div class="rstep" [class.now]="step() === 5" [class.locked]="!started()">
                <div class="rstep-head">
                  <i>5</i>
                  <div>
                    <strong>Finish with a completion report</strong>
                    <span>What you did. The reporter and the admin will be notified.</span>
                  </div>
                </div>
                @if (started()) {
                  <div class="rstep-body">
                    <ion-list lines="full" class="rstep-form">
                      <ion-item>
                        <ion-textarea label="Actions taken *" labelPlacement="stacked" [autoGrow]="true" rows="3" placeholder="What did you do to fix it?" [(ngModel)]="completion.actions_taken" />
                      </ion-item>
                      <ion-item>
                        <ion-textarea label="Remarks" labelPlacement="stacked" [autoGrow]="true" rows="2" placeholder="Recommendations, follow-ups, notes" [(ngModel)]="completion.remarks" />
                      </ion-item>
                      <ion-item>
                        <ion-input label="Date completed" labelPlacement="stacked" type="datetime-local" [min]="completionMin()" [max]="completionMax()" [(ngModel)]="completion.completed_at" />
                      </ion-item>
                      @if (w.equipment) {
                        <ion-item>
                          <ion-select label="Equipment condition after repair" labelPlacement="stacked" interface="action-sheet" [(ngModel)]="completion.condition_after">
                            @for (c of conditionsAfter; track c.value) {
                              <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                            }
                          </ion-select>
                        </ion-item>
                      }
                    </ion-list>
                    @if (!afterPhotos().length) {
                      <p class="small"><ion-text color="warning">Tip: add an "after" photo in step 4 first.</ion-text></p>
                    }
                    <ion-button expand="block" color="success" (click)="submitCompletion()">
                      <ion-icon slot="start" name="checkmark-circle-outline" /> Complete repair
                    </ion-button>
                  </div>
                }
              </div>
            </div>
          } @else {
            <!-- Status update -->
            @if (canWork()) {
              @if (w.status === 'pending') {
                <ion-button expand="block" (click)="setStatus('in_progress')">
                  <ion-icon slot="start" name="play-outline" /> Start repair (In Progress)
                </ion-button>
              } @else if (w.status === 'in_progress' && !showComplete()) {
                <ion-button expand="block" color="success" (click)="openComplete()">
                  <ion-icon slot="start" name="checkmark-circle-outline" /> Mark as completed
                </ion-button>
                <ion-button expand="block" fill="clear" color="medium" (click)="setStatus('pending')">Move back to Pending</ion-button>
              }
            }

            <!-- Completion report form -->
            @if (showComplete()) {
              <div class="section-title">Completion report</div>
              <div class="panel">
                <ion-list lines="full">
                  <ion-item>
                    <ion-textarea label="Actions taken *" labelPlacement="stacked" [autoGrow]="true" rows="3" placeholder="What did you do to fix it?" [(ngModel)]="completion.actions_taken" />
                  </ion-item>
                  <ion-item>
                    <ion-textarea label="Remarks" labelPlacement="stacked" [autoGrow]="true" rows="2" placeholder="Recommendations, follow-ups, notes" [(ngModel)]="completion.remarks" />
                  </ion-item>
                  <ion-item>
                    <ion-input label="Date completed" labelPlacement="stacked" type="datetime-local" [min]="completionMin()" [max]="completionMax()" [(ngModel)]="completion.completed_at" />
                  </ion-item>
                  @if (w.equipment) {
                    <ion-item>
                      <ion-select label="Equipment condition after repair" labelPlacement="stacked" interface="action-sheet" [(ngModel)]="completion.condition_after">
                        @for (c of conditionsAfter; track c.value) {
                          <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                        }
                      </ion-select>
                    </ion-item>
                  }
                </ion-list>
                @if (!afterPhotos().length) {
                  <p class="small"><ion-text color="warning">Tip: add an "after" photo below before submitting.</ion-text></p>
                }
                <ion-button expand="block" color="success" (click)="submitCompletion()">Submit completion report</ion-button>
                <ion-button expand="block" fill="clear" color="medium" (click)="showComplete.set(false)">Cancel</ion-button>
              </div>
            }

            @if (w.status === 'completed') {
              <div class="section-title">Completion report</div>
              <div class="panel">
                <dl class="kv">
                  <dt>Date completed</dt><dd>{{ w.completed_at | date: 'MMM d, y h:mm a' }}</dd>
                  <dt>Actions taken</dt><dd class="pre-wrap">{{ w.actions_taken }}</dd>
                  <dt>Remarks</dt><dd class="pre-wrap">{{ w.remarks || '—' }}</dd>
                  @if (w.condition_after) { <dt>Condition after</dt><dd><app-badge kind="condition" [value]="w.condition_after" /></dd> }
                </dl>
                @if (canWork()) {
                  <ion-button size="small" fill="clear" (click)="openComplete()">Edit report</ion-button>
                }
              </div>
            }

            <!-- Before / after photos -->
            @for (kind of photoKinds; track kind) {
              <div class="section-title">{{ kind === 'before' ? 'Before repair' : 'After repair' }} photos</div>
              <div class="panel">
                <div class="photo-grid">
                  @for (p of kind === 'before' ? beforePhotos() : afterPhotos(); track p.id) {
                    <div class="photo">
                      <a [href]="p.url" target="_blank"><img [src]="p.url" alt="" loading="lazy" /></a>
                      @if (canEdit()) {
                        <button class="remove" (click)="removePhoto(p)" aria-label="Remove photo"><ion-icon name="close-outline" /></button>
                      }
                    </div>
                  }
                  @if (canEdit()) {
                    <button class="photo-add" (click)="addPhoto(kind)" [disabled]="uploading()">
                      <span>
                        @if (uploading() === kind) { <ion-spinner name="crescent" /> } @else { <ion-icon name="camera-outline" />Add }
                      </span>
                    </button>
                  }
                </div>
                @if (!canEdit() && !(kind === 'before' ? beforePhotos() : afterPhotos()).length) {
                  <p class="muted small mt-0">No photos.</p>
                }
              </div>
            }

            <!-- Materials and equipment -->
            <div class="section-title">
              Materials &amp; equipment used
              @if (w.materials_cost) { <span>₱{{ w.materials_cost | number: '1.2-2' }}</span> }
            </div>
            <ion-list class="cards">
              @for (m of w.materials; track m.id) {
                <ion-item>
                  <ion-icon slot="start" [name]="m.type === 'equipment' ? 'construct-outline' : 'cube-outline'" />
                  <ion-label>
                    <h3>{{ m.name }}</h3>
                    <p>
                      {{ m.quantity }} {{ m.unit }} · {{ m.type === 'equipment' ? 'Equipment' : 'Material' }}
                      @if (m.unit_cost) { · ₱{{ m.unit_cost | number: '1.2-2' }} each }
                    </p>
                  </ion-label>
                  @if (canEdit()) {
                    <ion-button slot="end" fill="clear" color="danger" (click)="removeMaterial(m)"><ion-icon slot="icon-only" name="trash-outline" /></ion-button>
                  }
                </ion-item>
              } @empty {
                <p class="muted small">Nothing recorded yet.</p>
              }
            </ion-list>

            @if (canEdit()) {
              <div class="panel">
                <ion-segment [(ngModel)]="material.type">
                  <ion-segment-button value="material"><ion-label>Material</ion-label></ion-segment-button>
                  <ion-segment-button value="equipment"><ion-label>Equipment</ion-label></ion-segment-button>
                </ion-segment>
                <ion-list lines="full">
                  <ion-item>
                    <ion-input label="Name" labelPlacement="stacked" [placeholder]="material.type === 'material' ? 'e.g. PVC pipe 1/2&quot;' : 'e.g. Ladder'" [(ngModel)]="material.name" />
                  </ion-item>
                  <ion-row>
                    <ion-col size="4"><ion-input label="Qty" labelPlacement="stacked" type="number" min="0" [(ngModel)]="material.quantity" /></ion-col>
                    <ion-col size="4"><ion-input label="Unit" labelPlacement="stacked" placeholder="pcs" [(ngModel)]="material.unit" /></ion-col>
                    <ion-col size="4"><ion-input label="Unit cost ₱" labelPlacement="stacked" type="number" min="0" [(ngModel)]="material.unit_cost" /></ion-col>
                  </ion-row>
                </ion-list>
                <ion-button expand="block" fill="outline" (click)="addMaterial()">
                  <ion-icon slot="start" name="add-outline" /> Add {{ material.type }}
                </ion-button>
              </div>
            }

          }

          @if (w.activities?.length) {
            <div class="section-title">Activity history</div>
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

      <!-- Photo grid used by the repair steps -->
      <ng-template #photoGrid let-kind>
        <div class="photo-grid">
          @for (p of kind === 'before' ? beforePhotos() : afterPhotos(); track p.id) {
            <div class="photo">
              <a [href]="p.url" target="_blank"><img [src]="p.url" alt="" loading="lazy" /></a>
              <button class="remove" (click)="removePhoto(p)" aria-label="Remove photo"><ion-icon name="close-outline" /></button>
            </div>
          }
          <button class="photo-add" (click)="addPhoto(kind)" [disabled]="uploading()">
            <span>
              @if (uploading() === kind) { <ion-spinner name="crescent" /> } @else { <ion-icon name="camera-outline" />Add photo }
            </span>
          </button>
        </div>
      </ng-template>

      <!-- Materials list + add form used by the repair steps -->
      <ng-template #materialsBlock>
        @if (wo(); as w) {
          @for (m of w.materials; track m.id) {
            <div class="rmat">
              <ion-icon [name]="m.type === 'equipment' ? 'construct-outline' : 'cube-outline'" />
              <div>
                <strong>{{ m.name }}</strong>
                <span>{{ m.quantity }} {{ m.unit }}@if (m.unit_cost) { · ₱{{ m.unit_cost | number: '1.2-2' }} each }</span>
              </div>
              <ion-button fill="clear" color="danger" size="small" (click)="removeMaterial(m)" aria-label="Remove">
                <ion-icon slot="icon-only" name="trash-outline" />
              </ion-button>
            </div>
          }
          @if (w.materials_cost) {
            <p class="rstep-note">Total cost: <strong>₱{{ w.materials_cost | number: '1.2-2' }}</strong></p>
          }
          @if (showMaterialForm()) {
            <ion-segment [(ngModel)]="material.type">
              <ion-segment-button value="material"><ion-label>Material</ion-label></ion-segment-button>
              <ion-segment-button value="equipment"><ion-label>Equipment</ion-label></ion-segment-button>
            </ion-segment>
            <ion-list lines="full" class="rstep-form">
              <ion-item>
                <ion-input label="Name" labelPlacement="stacked" [placeholder]="material.type === 'material' ? 'e.g. PVC pipe 1/2&quot;' : 'e.g. Ladder'" [(ngModel)]="material.name" />
              </ion-item>
              <ion-row>
                <ion-col size="4"><ion-input label="Qty" labelPlacement="stacked" type="number" min="0" [(ngModel)]="material.quantity" /></ion-col>
                <ion-col size="4"><ion-input label="Unit" labelPlacement="stacked" placeholder="pcs" [(ngModel)]="material.unit" /></ion-col>
                <ion-col size="4"><ion-input label="Unit cost ₱" labelPlacement="stacked" type="number" min="0" [(ngModel)]="material.unit_cost" /></ion-col>
              </ion-row>
            </ion-list>
            <ion-button expand="block" fill="outline" (click)="addMaterial()">
              <ion-icon slot="start" name="add-outline" /> Add {{ material.type }}
            </ion-button>
          } @else {
            <ion-button expand="block" fill="outline" (click)="showMaterialForm.set(true)">
              <ion-icon slot="start" name="add-outline" /> Add material or equipment
            </ion-button>
          }
        }
      </ng-template>
    </ion-content>
  `,
})
export class WorkOrderDetailPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private camera = inject(CameraService);
  private router = inject(Router);
  private nav = inject(NavController);
  protected auth = inject(AuthService);

  readonly id = input.required<string>();
  protected loadError = signal('');

  protected wo = signal<WorkOrder | null>(null);
  protected showComplete = signal(false);
  protected uploading = signal<'before' | 'after' | null>(null);
  protected photoKinds = ['before', 'after'] as const;

  protected beforePhotos = computed(() => this.wo()?.photos?.filter((p) => p.type === 'before') ?? []);
  protected afterPhotos = computed(() => this.wo()?.photos?.filter((p) => p.type === 'after') ?? []);

  /** Assigned personnel (or admin) may update status. */
  protected canWork = computed(() => {
    const w = this.wo();
    const u = this.auth.user();
    if (!w || !u || w.status === 'cancelled') return false;
    return u.role === 'admin' || (u.role === 'maintenance' && w.assigned_to === u.id);
  });

  /** The assigned maintenance person gets step-by-step guidance until the job is done. */
  protected guided = computed(() => {
    const w = this.wo();
    return !!w && this.auth.isMaintenance() && this.canWork() && (w.status === 'pending' || w.status === 'in_progress');
  });
  protected started = computed(() => this.wo()?.status === 'in_progress');
  /** The step to do next: 1 start · 2 before photo · 4 after photo · 5 report (3 materials is optional). */
  protected step = computed(() => {
    if (!this.started()) return 1;
    if (!this.beforePhotos().length) return 2;
    if (!this.afterPhotos().length) return 4;
    return 5;
  });
  protected showMaterialForm = signal(false);

  /** Photos/materials stay editable for admin; for personnel until completed. */
  protected canEdit = computed(() => this.canWork() && (this.auth.isAdmin() || this.wo()?.status !== 'completed'));

  completion = { actions_taken: '', remarks: '', completed_at: '', condition_after: 'operational' };
  protected conditionsAfter = EQUIPMENT_CONDITIONS.filter((c) => c.value !== 'under_maintenance');
  protected eqIcon = equipmentIcon;
  protected conditionTone(c: string): string {
    return toneOf('condition', c);
  }
  material = this.blankMaterial();

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set('');
    try {
      const w = await this.api.get<WorkOrder>(`work-orders/${this.id()}`);
      this.wo.set(w);
      // the completion form is part of the guided steps, so give it its defaults up front
      if (w.status !== 'completed' && !this.completion.completed_at) this.resetCompletion(w);
    } catch (err) {
      this.loadError.set(errorMessage(err));
    }
  }

  async setStatus(status: 'pending' | 'in_progress'): Promise<void> {
    const w = await this.ui.busy(() => this.api.post<WorkOrder>(`work-orders/${this.id()}/status`, { status }));
    if (w) {
      this.wo.set(w);
      await this.ui.toast(status === 'in_progress' ? 'Repair started. Next: take a "before" photo.' : 'Moved back to pending.');
    }
  }

  openComplete(): void {
    this.resetCompletion(this.wo()!);
    this.showComplete.set(true);
  }

  /** Date completed range: from when the repair started up to now (same "YYYY-MM-DDTHH:mm" format as the input). */
  protected completionMin(): string | null {
    const started = this.wo()?.started_at;
    return started ? toLocalInput(new Date(started)) : null;
  }
  protected completionMax(): string {
    return toLocalInput(new Date());
  }

  private resetCompletion(w: WorkOrder): void {
    this.completion = {
      actions_taken: w.actions_taken ?? '',
      remarks: w.remarks ?? '',
      completed_at: toLocalInput(w.completed_at ? new Date(w.completed_at) : new Date()),
      condition_after: w.condition_after ?? 'operational',
    };
  }

  async submitCompletion(): Promise<void> {
    if (!this.completion.actions_taken.trim()) {
      await this.ui.toast('Please describe the actions taken.', 'warning');
      return;
    }
    // the picker limits the range, but a typed date can still be outside it
    const done = this.completion.completed_at;
    if (done && done > this.completionMax()) {
      await this.ui.toast("Date completed can't be in the future.", 'warning');
      return;
    }
    if (done && this.completionMin() && done < this.completionMin()!) {
      await this.ui.toast("Date completed can't be before the repair started.", 'warning');
      return;
    }
    const w = await this.ui.busy(() =>
      this.api.post<WorkOrder>(`work-orders/${this.id()}/status`, {
        status: 'completed',
        ...this.completion,
        completed_at: this.completion.completed_at ? new Date(this.completion.completed_at).toISOString() : null,
      }),
    );
    if (w) {
      const wasGuided = this.guided();
      this.wo.set(w);
      this.showComplete.set(false);
      await this.ui.toast('Repair completed. The reporter has been notified.', 'success');
      // back to the dashboard, where the next task is waiting
      if (wasGuided) await this.nav.navigateBack('/tabs/home');
    }
  }

  async addPhoto(type: 'before' | 'after'): Promise<void> {
    const source = await this.ui.photoSource(type === 'before' ? 'Before photo' : 'After photo');
    if (!source) return;
    const file = source === 'camera' ? await this.camera.takePhoto() : await pickPhoto(false);
    if (!file) return;
    this.uploading.set(type);
    try {
      const photo = await this.api.upload<WorkOrderPhoto>(`work-orders/${this.id()}/photos`, {
        type,
        photo: await resizeImage(file),
      });
      this.patch((w) => ({ ...w, photos: [...(w.photos ?? []), photo] }));
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.uploading.set(null);
    }
  }

  async removePhoto(photo: WorkOrderPhoto): Promise<void> {
    if (!(await this.ui.confirm('Remove photo', 'Delete this photo?', 'Delete', true))) return;
    const ok = await this.ui.busy(() => this.api.delete(`work-order-photos/${photo.id}`).then(() => true));
    if (ok) this.patch((w) => ({ ...w, photos: w.photos?.filter((p) => p.id !== photo.id) }));
  }

  async addMaterial(): Promise<void> {
    if (!this.material.name.trim() || !(Number(this.material.quantity) > 0)) {
      await this.ui.toast('Enter a name and quantity.', 'warning');
      return;
    }
    try {
      await this.api.post<WorkOrderMaterial>(`work-orders/${this.id()}/materials`, {
        ...this.material,
        unit_cost: this.material.unit_cost === '' ? null : this.material.unit_cost,
      });
      this.material = { ...this.blankMaterial(), type: this.material.type };
      this.showMaterialForm.set(false);
      await this.load(); // refresh totals
    } catch (err) {
      await this.ui.error(err);
    }
  }

  async removeMaterial(m: WorkOrderMaterial): Promise<void> {
    const ok = await this.ui.busy(() => this.api.delete(`work-order-materials/${m.id}`).then(() => true));
    if (ok) await this.load();
  }

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

  private patch(fn: (w: WorkOrder) => WorkOrder): void {
    const w = this.wo();
    if (w) this.wo.set(fn(w));
  }

  private blankMaterial() {
    return { name: '', type: 'material' as 'material' | 'equipment', quantity: 1 as number | string, unit: '', unit_cost: '' as number | string };
  }
}

/** Date → "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
