import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { pickPhoto, resizeImage } from '../../core/image';
import { WorkOrder, WorkOrderMaterial, WorkOrderPhoto } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';

@Component({
  selector: 'app-work-order-detail',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe, DecimalPipe],
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
                  <ion-input label="Date completed" labelPlacement="stacked" type="datetime-local" [(ngModel)]="completion.completed_at" />
                </ion-item>
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

          @if (auth.isAdmin() && w.status !== 'cancelled' && w.status !== 'completed') {
            <ion-button expand="block" fill="clear" color="danger" (click)="cancel()">Cancel work order</ion-button>
          }
        </div>
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
})
export class WorkOrderDetailPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  protected auth = inject(AuthService);

  readonly id = input.required<string>();

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

  /** Photos/materials stay editable for admin; for personnel until completed. */
  protected canEdit = computed(() => this.canWork() && (this.auth.isAdmin() || this.wo()?.status !== 'completed'));

  completion = { actions_taken: '', remarks: '', completed_at: '' };
  material = this.blankMaterial();

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.wo.set(await this.api.get<WorkOrder>(`work-orders/${this.id()}`));
    } catch (err) {
      await this.ui.error(err);
    }
  }

  async setStatus(status: 'pending' | 'in_progress'): Promise<void> {
    const w = await this.ui.busy(() => this.api.post<WorkOrder>(`work-orders/${this.id()}/status`, { status }));
    if (w) {
      this.wo.set(w);
      await this.ui.toast(status === 'in_progress' ? 'Repair started. Remember to take a "before" photo.' : 'Moved back to pending.');
    }
  }

  openComplete(): void {
    const w = this.wo()!;
    this.completion = {
      actions_taken: w.actions_taken ?? '',
      remarks: w.remarks ?? '',
      completed_at: toLocalInput(w.completed_at ? new Date(w.completed_at) : new Date()),
    };
    this.showComplete.set(true);
  }

  async submitCompletion(): Promise<void> {
    if (!this.completion.actions_taken.trim()) {
      await this.ui.toast('Please describe the actions taken.', 'warning');
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
      this.wo.set(w);
      this.showComplete.set(false);
      await this.ui.toast('Repair completed. The reporter has been notified.', 'success');
    }
  }

  async addPhoto(type: 'before' | 'after'): Promise<void> {
    const file = await pickPhoto();
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
