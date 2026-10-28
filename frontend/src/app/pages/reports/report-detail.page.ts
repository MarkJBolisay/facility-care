import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CATEGORIES, PRIORITIES, Report, WorkOrder } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';

interface Step {
  label: string;
  at: string | null;
  icon: string;
  color: string;
  note?: string;
}

@Component({
  selector: 'app-report-detail',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.isAdmin() ? '/tabs/reports' : auth.homeUrl()" /></ion-buttons>
        <ion-title>{{ report()?.reference || 'Report' }}</ion-title>
        @if (canDelete()) {
          <ion-buttons slot="end">
            <ion-button color="danger" (click)="remove()"><ion-icon slot="icon-only" name="trash-outline" /></ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      @if (report(); as r) {
        <div class="max">
          @if (r.photo_url) {
            <a [href]="r.photo_url" target="_blank"><img class="hero-photo" [src]="r.photo_url" alt="Reported issue" /></a>
          }

          <div class="panel">
            <h2 class="mt-0">{{ r.title }}</h2>
            <div class="pills">
              <app-badge kind="status" [value]="r.status" />
              <app-badge kind="priority" [value]="r.priority" />
              <ion-badge color="light" class="pill">{{ r.category | label: 'category' }}</ion-badge>
            </div>
            <p class="pre-wrap">{{ r.description }}</p>
            <dl class="kv">
              <dt>Location</dt>
              <dd>{{ r.facility?.full_name || '—' }}@if (r.location_details) {<br /><span class="muted">{{ r.location_details }}</span>}</dd>
              <dt>Reported by</dt>
              <dd>{{ r.reporter?.name }} <span class="muted">({{ r.reporter?.role | label: 'role' }})</span></dd>
              <dt>Submitted</dt>
              <dd>{{ r.created_at | date: 'MMM d, y h:mm a' }}</dd>
            </dl>
            @if (r.admin_remarks) {
              <p class="small">
                <strong>{{ r.status === 'rejected' ? 'Reason for rejection' : 'Admin remarks' }}:</strong>
                {{ r.admin_remarks }}
              </p>
            }
          </div>

          <!-- Administrator tools -->
          @if (auth.isAdmin()) {
            <div class="section-title">Review &amp; classification</div>
            <div class="panel">
              <ion-list lines="full">
                <ion-item>
                  <ion-select label="Category" interface="action-sheet" placeholder="Uncategorized" [(ngModel)]="category">
                    @for (c of categories; track c.value) {
                      <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
                <ion-item>
                  <ion-select label="Priority" interface="action-sheet" placeholder="Not set" [(ngModel)]="priority">
                    @for (p of priorities; track p.value) {
                      <ion-select-option [value]="p.value">{{ p.label }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              </ion-list>
              <p class="small muted">
                Low – cosmetic / can wait · Medium – affects comfort · High – disrupts classes · Critical – safety hazard, fix now
              </p>
              @if (r.status === 'pending' || r.status === 'rejected') {
                <ion-button expand="block" color="success" (click)="approve()">
                  <ion-icon slot="start" name="checkmark-circle-outline" /> Approve
                </ion-button>
              } @else {
                <ion-button expand="block" fill="outline" (click)="saveClassification()">Save changes</ion-button>
              }
              @if (r.status === 'pending' || r.status === 'approved') {
                <ion-button expand="block" fill="clear" color="danger" (click)="reject()">
                  <ion-icon slot="start" name="close-circle-outline" /> Reject
                </ion-button>
              }
            </div>

            <div class="section-title">Maintenance assignment</div>
            @if (activeWo(); as wo) {
              <ion-list class="cards">
                <ion-item button detail [routerLink]="['/work-orders', wo.id]">
                  <ion-icon slot="start" name="hammer-outline" />
                  <ion-label>
                    <h3>{{ wo.reference }}</h3>
                    <p>{{ wo.assignee?.name || 'Not yet assigned' }}{{ wo.due_date ? ' · due ' + wo.due_date : '' }}</p>
                    <div class="pills"><app-badge kind="status" [value]="wo.status" /></div>
                  </ion-label>
                </ion-item>
              </ion-list>
            } @else if (r.status !== 'rejected' && r.status !== 'completed') {
              <ion-button expand="block" (click)="assign()">
                <ion-icon slot="start" name="person-add-outline" /> Assign maintenance personnel
              </ion-button>
            } @else {
              <p class="muted small">No active work order.</p>
            }

            <ion-button expand="block" fill="clear" [routerLink]="['/notifications/send']" [queryParams]="{ reportId: r.id }">
              <ion-icon slot="start" name="send-outline" /> Send update to reporter
            </ion-button>
          } @else if (activeWo(); as wo) {
            <div class="section-title">Repair</div>
            <div class="panel">
              <dl class="kv">
                <dt>Work order</dt><dd>{{ wo.reference }}</dd>
                <dt>Assigned to</dt><dd>{{ wo.assignee?.name || 'Waiting for assignment' }}</dd>
                @if (wo.due_date) {<dt>Target date</dt><dd>{{ wo.due_date }}</dd>}
                @if (wo.actions_taken) {<dt>Actions taken</dt><dd>{{ wo.actions_taken }}</dd>}
              </dl>
            </div>
          }

          <div class="section-title">Progress</div>
          <ion-list class="cards">
            @for (s of steps(); track s.label) {
              <ion-item>
                <ion-icon slot="start" [name]="s.icon" [color]="s.at ? s.color : 'medium'" />
                <ion-label [class.muted]="!s.at">
                  <h3>{{ s.label }}</h3>
                  <p>{{ s.at ? (s.at | date: 'MMM d, y h:mm a') : 'Waiting' }}</p>
                  @if (s.note) {<p>{{ s.note }}</p>}
                </ion-label>
              </ion-item>
            }
          </ion-list>
        </div>
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
})
export class ReportDetailPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  protected auth = inject(AuthService);

  readonly id = input.required<string>();

  protected categories = CATEGORIES;
  protected priorities = PRIORITIES;
  protected report = signal<Report | null>(null);
  category: string | null = null;
  priority: string | null = null;

  protected activeWo = computed<WorkOrder | null>(
    () => this.report()?.work_orders?.find((w) => w.status !== 'cancelled') ?? null,
  );

  protected canDelete = computed(() => {
    const r = this.report();
    if (!r) return false;
    return this.auth.isAdmin() || (r.user_id === this.auth.user()?.id && r.status === 'pending');
  });

  protected steps = computed<Step[]>(() => {
    const r = this.report();
    if (!r) return [];
    const wo = this.activeWo();
    const steps: Step[] = [{ label: 'Submitted', at: r.created_at, icon: 'document-text-outline', color: 'primary' }];
    if (r.status === 'rejected') {
      steps.push({ label: 'Rejected', at: r.reviewed_at, icon: 'close-circle-outline', color: 'danger', note: r.admin_remarks ?? '' });
      return steps;
    }
    steps.push(
      { label: 'Approved', at: r.reviewed_at, icon: 'flag-outline', color: 'tertiary' },
      { label: 'Personnel assigned', at: wo?.assigned_at ?? null, icon: 'person-outline', color: 'tertiary', note: wo?.assignee?.name },
      { label: 'Repair started', at: wo?.started_at ?? null, icon: 'construct-outline', color: 'primary' },
      { label: 'Completed', at: wo?.completed_at ?? null, icon: 'checkmark-circle-outline', color: 'success', note: wo?.remarks ?? undefined },
    );
    return steps;
  });

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const r = await this.api.get<Report>(`reports/${this.id()}`);
      this.category = r.category;
      this.priority = r.priority;
      this.report.set(r);
    } catch (err) {
      await this.ui.error(err);
    }
  }

  async approve(): Promise<void> {
    if (!this.priority) {
      await this.ui.toast('Set a priority before approving.', 'warning');
      return;
    }
    const r = await this.ui.busy(() =>
      this.api.post<Report>(`reports/${this.id()}/approve`, { category: this.category, priority: this.priority }),
    );
    if (r) {
      this.report.set(r);
      await this.ui.toast('Report approved. You can now assign personnel.', 'success');
    }
  }

  async reject(): Promise<void> {
    const reason = await this.ui.prompt('Reject report', 'Reason (the reporter will see this)', 'Reject');
    if (reason === null) return;
    const r = await this.ui.busy(() => this.api.post<Report>(`reports/${this.id()}/reject`, { admin_remarks: reason }));
    if (r) {
      this.report.set(r);
      await this.ui.toast('Report rejected.');
    }
  }

  async saveClassification(): Promise<void> {
    const r = await this.ui.busy(() =>
      this.api.put<Report>(`reports/${this.id()}`, { category: this.category, priority: this.priority }),
    );
    if (r) {
      this.report.set(r);
      await this.ui.toast('Saved.', 'success');
    }
  }

  async assign(): Promise<void> {
    if (this.report()?.status === 'pending' && !this.priority) {
      await this.ui.toast('Set a priority first.', 'warning');
      return;
    }
    await this.router.navigate(['/work-orders/new'], {
      queryParams: { reportId: this.id(), priority: this.priority ?? '', category: this.category ?? '' },
    });
  }

  async remove(): Promise<void> {
    if (!(await this.ui.confirm('Delete report', 'This cannot be undone.', 'Delete', true))) return;
    const ok = await this.ui.busy(() => this.api.delete(`reports/${this.id()}`).then(() => true));
    if (ok) {
      await this.ui.toast('Report deleted.');
      await this.router.navigateByUrl(this.auth.isAdmin() ? '/tabs/reports' : '/tabs/my-reports', { replaceUrl: true });
    }
  }
}
