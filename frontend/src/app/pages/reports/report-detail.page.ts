import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NavController } from '@ionic/angular';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CATEGORIES, PRIORITIES, Report, WorkOrder, equipmentIcon, toneOf } from '../../core/models';
import { ActivityComponent } from '../../shared/activity';
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
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe, ActivityComponent],
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
          <!-- Reporter: the repair is done, is it really fixed? -->
          @if (r.user_id === auth.user()?.id && r.status === 'completed' && !r.confirmed_at) {
            <div class="confirm-panel">
              <ion-icon name="checkmark-done-outline" aria-hidden="true" />
              <div class="confirm-text">
                <strong>The repair is done. Is it fixed?</strong>
                <span>Please check and let us know. If it is still broken, it goes back to the admin to fix again.</span>
              </div>
              <div class="confirm-actions">
                <ion-button color="success" (click)="confirmFixed()">
                  <ion-icon slot="start" name="checkmark-circle-outline" /> Fixed
                </ion-button>
                <ion-button fill="outline" color="danger" (click)="reopen()">
                  <ion-icon slot="start" name="refresh-outline" /> Still not fixed
                </ion-button>
              </div>
            </div>
          }

          @if (r.photo_url) {
            <a [href]="r.photo_url" target="_blank"><img class="hero-photo" [src]="r.photo_url" alt="Reported issue" /></a>
          }

          <div class="panel">
            <h2 class="mt-0">{{ r.title }}</h2>
            <div class="pills">
              <app-badge kind="status" [value]="r.status" />
              @if (r.reopen_count) {
                <ion-badge color="danger" class="pill">Reopened{{ r.reopen_count > 1 ? ' ×' + r.reopen_count : '' }}</ion-badge>
              }
              @if (r.confirmed_at) {
                <ion-badge color="success" class="pill">Confirmed fixed</ion-badge>
              }
              <app-badge kind="priority" [value]="r.priority" />
              @if (r.severity) { <app-badge kind="severity" [value]="r.severity" /> }
              <ion-badge color="light" class="pill">{{ r.category | label: 'category' }}{{ r.category === 'others' && r.category_other ? ': ' + r.category_other : '' }}</ion-badge>
            </div>
            <p class="pre-wrap">{{ r.description }}</p>
            <dl class="kv">
              <dt>Location</dt>
              <dd>
                @if (r.facility) {
                  {{ r.facility.full_name }}@if (r.location_details) {<br /><span class="muted">{{ r.location_details }}</span>}
                } @else {
                  {{ r.location_details || '—' }}
                }
              </dd>
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

          <!-- The equipment this request is about -->
          @if (r.equipment; as e) {
            <div class="section-title">Equipment</div>
            @if (auth.isAdmin() || auth.isMaintenance()) {
              <ion-list class="cards">
                <ion-item button detail [routerLink]="['/equipment', e.id]">
                  <div slot="start" class="eq-icon" [class]="'eq-icon tint-' + conditionTone(e.condition)"><ion-icon [name]="eqIcon(e.category)" /></div>
                  <ion-label>
                    <h3>{{ e.name }}</h3>
                    <p>{{ e.code }}{{ e.model ? ' · ' + e.model : '' }}</p>
                    <div class="pills">
                      <app-badge kind="condition" [value]="e.condition" />
                      <ion-badge color="light" class="pill">{{ e.importance | label: 'importance' }} importance</ion-badge>
                    </div>
                  </ion-label>
                </ion-item>
              </ion-list>
            } @else {
              <div class="panel">
                <strong>{{ e.name }}</strong> <span class="muted small">({{ e.code }})</span>
                <div class="pills"><app-badge kind="condition" [value]="e.condition" /></div>
              </div>
            }
          }

          <!-- Administrator tools -->
          @if (auth.isAdmin()) {
            <!-- Where this report is in the admin flow -->
            <div class="flow-steps" aria-label="Report steps">
              @for (s of adminSteps; track s; let i = $index) {
                <div class="flow-step" [class.done]="i < adminStep()" [class.now]="i === adminStep()">
                  <i>{{ i < adminStep() ? '✓' : i + 1 }}</i><span>{{ s }}</span>
                </div>
              }
            </div>

            <!-- Other unfixed requests about the same item (or same room + category) -->
            @if (r.possible_duplicates?.length) {
              <div class="dup-panel" role="status">
                <div class="dup-head">
                  <ion-icon name="warning-outline" aria-hidden="true" />
                  <strong>Possible duplicate</strong>
                </div>
                <p class="small">
                  {{ r.equipment ? 'This equipment' : 'The same room and category' }} already has
                  {{ r.possible_duplicates!.length === 1 ? 'an open request' : r.possible_duplicates!.length + ' open requests' }}:
                </p>
                @for (d of r.possible_duplicates; track d.id) {
                  <div class="dup-row">
                    <a [routerLink]="['/reports', d.id]">
                      <strong>{{ d.reference }}</strong> · {{ d.title }}
                      <span>{{ d.reporter?.name }} · {{ d.created_at | date: 'MMM d' }} · {{ d.status | label: 'status' }}</span>
                    </a>
                    @if (r.status === 'pending' || (r.status === 'approved' && !activeWo())) {
                      <ion-button size="small" fill="outline" color="danger" (click)="rejectAsDuplicate(d.reference)">
                        Reject as duplicate
                      </ion-button>
                    }
                  </div>
                }
              </div>
            }

            <div class="section-title">Review &amp; classification</div>
            <div class="panel">
              <!-- Automated prioritization: recommended level from importance, severity and waiting time -->
              @if (r.priority_assessment; as pa) {
                <div class="prio-rec">
                  <div class="prio-rec-head">
                    <ion-icon name="sparkles" />
                    <div>
                      <span>Recommended priority</span>
                      <strong>{{ pa.recommended | label: 'priority' }} <em>· score {{ pa.score }}/100</em></strong>
                    </div>
                    @if (priority !== pa.recommended) {
                      <ion-button size="small" (click)="priority = pa.recommended">Use</ion-button>
                    } @else {
                      <ion-badge color="success" class="pill">Applied</ion-badge>
                    }
                  </div>
                  @for (f of pa.factors; track f.label) {
                    <div class="prio-factor">
                      <div class="prio-factor-head"><span>{{ f.label }}: <strong>{{ f.value }}</strong></span><span>{{ f.points }}/{{ f.max }}</span></div>
                      <div class="bar-track"><div class="bar-fill" [style.width.%]="(f.points / f.max) * 100"></div></div>
                    </div>
                  }
                </div>
              }
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
                <ion-button expand="block" (click)="approve(true)">
                  <ion-icon slot="start" name="person-add-outline" /> Approve &amp; assign personnel
                </ion-button>
                <ion-button expand="block" fill="outline" color="success" (click)="approve(false)">
                  <ion-icon slot="start" name="checkmark-circle-outline" /> Approve only
                </ion-button>
              } @else {
                <ion-button expand="block" fill="outline" (click)="saveClassification()">Save changes</ion-button>
              }
              @if (r.status === 'pending' || (r.status === 'approved' && !activeWo())) {
                <ion-button expand="block" fill="clear" color="danger" (click)="reject()">
                  <ion-icon slot="start" name="close-circle-outline" /> Reject
                </ion-button>
              }
            </div>

            <!-- Assignment shows once the report is approved (step 2) -->
            @if (r.status !== 'pending') {
              <div class="section-title">Maintenance assignment</div>
            }
            @if (r.status === 'pending') {
              <!-- assigning happens through "Approve & assign" above -->
            } @else if (activeWo(); as wo) {
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

          @if (auth.isAdmin() && r.activities?.length) {
            <div class="section-title">Activity history</div>
            <div class="panel"><app-activity [items]="r.activities" /></div>
          }

          <!-- Reporter: a rejected request, or a confirmed repair that broke again later, can be reported again -->
          @if (!auth.isAdmin() && r.user_id === auth.user()?.id && (r.status === 'rejected' || (r.status === 'completed' && r.confirmed_at))) {
            <div class="panel ion-text-center">
              <p class="mt-0"><strong>{{ r.status === 'completed' ? 'Still not fixed?' : 'Still a problem?' }}</strong></p>
              <p class="small muted">Send a follow-up report. The details of this report will be filled in for you.</p>
              <ion-button expand="block" fill="outline" routerLink="/reports/new" [queryParams]="{ followUp: r.id }">
                <ion-icon slot="start" name="refresh-outline" /> Report it again
              </ion-button>
            </div>
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
export class ReportDetailPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private nav = inject(NavController);
  protected auth = inject(AuthService);

  readonly id = input.required<string>();
  protected loadError = signal('');

  protected eqIcon = equipmentIcon;
  protected conditionTone(c: string): string {
    return toneOf('condition', c);
  }
  protected categories = CATEGORIES;
  protected priorities = PRIORITIES;
  protected report = signal<Report | null>(null);
  category: string | null = null;
  priority: string | null = null;

  protected readonly adminSteps = ['Review', 'Assign', 'Repair', 'Done'];
  /** 0 review · 1 assign · 2 repair · 3 done */
  protected adminStep = computed(() => {
    const r = this.report();
    const wo = this.activeWo();
    if (!r || r.status === 'pending' || r.status === 'rejected') return 0;
    if (r.status === 'completed') return 4;
    if (!wo || !wo.assigned_to) return 1;
    return 2;
  });

  /** The open work order; once the report is completed, the one that finished it. A reopened report has none until reassigned. */
  protected activeWo = computed<WorkOrder | null>(() => {
    const r = this.report();
    const list = r?.work_orders ?? [];
    const open = list.find((w) => w.status === 'pending' || w.status === 'in_progress');
    if (open) return open;
    return r?.status === 'completed' ? (list.find((w) => w.status === 'completed') ?? null) : null;
  });

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
    if (r.confirmed_at) {
      steps.push({ label: 'Confirmed fixed by reporter', at: r.confirmed_at, icon: 'checkmark-done-outline', color: 'success' });
    }
    return steps;
  });

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loadError.set('');
    try {
      const r = await this.api.get<Report>(`reports/${this.id()}`);
      this.category = r.category;
      this.priority = r.priority;
      this.report.set(r);
    } catch (err) {
      this.loadError.set(errorMessage(err));
    }
  }

  /** Approve the report; with andAssign, go straight to choosing the maintenance person. */
  async approve(andAssign = false): Promise<void> {
    if (!this.priority) {
      await this.ui.toast('Set a priority before approving.', 'warning');
      return;
    }
    const r = await this.ui.busy(() =>
      this.api.post<Report>(`reports/${this.id()}/approve`, { category: this.category, priority: this.priority }),
    );
    if (!r) return;
    this.report.set(r);
    if (andAssign) {
      await this.ui.toast('Report approved. Now choose who will fix it.', 'success');
      await this.assign();
    } else {
      await this.ui.toast('Report approved. Assign personnel when ready.', 'success');
    }
  }

  /** Reject, then return to the list so the next report can be reviewed. */
  async reject(): Promise<void> {
    const reason = await this.ui.prompt('Reject report', 'Reason (the reporter will see this)', 'Reject');
    if (reason === null) return;
    const r = await this.ui.busy(() => this.api.post<Report>(`reports/${this.id()}/reject`, { admin_remarks: reason }));
    if (r) {
      this.report.set(r);
      await this.ui.toast('Report rejected. The reporter has been notified.');
      await this.nav.navigateBack('/tabs/reports');
    }
  }

  /** Reporter: the repair worked. */
  async confirmFixed(): Promise<void> {
    const r = await this.ui.busy(() => this.api.post<Report>(`reports/${this.id()}/confirm`, {}));
    if (r) {
      this.report.set(r);
      await this.ui.toast('Thanks for confirming!', 'success');
    }
  }

  /** Reporter: still broken. It goes back to the admin to assign again. */
  async reopen(): Promise<void> {
    const reason = await this.ui.prompt('Still not fixed', 'What is still wrong? (e.g. still no power)', 'Send');
    if (reason === null) return;
    const r = await this.ui.busy(() => this.api.post<Report>(`reports/${this.id()}/reopen`, { reason }));
    if (r) {
      this.report.set(r);
      await this.ui.toast('Sent back to the admin. We will fix it again.', 'success');
    }
  }

  /** One click: reject this request because the same problem is already reported as `ref`. */
  async rejectAsDuplicate(ref: string): Promise<void> {
    const reason = `Duplicate of ${ref}. This problem is already reported and will be fixed under ${ref}.`;
    if (!(await this.ui.confirm('Reject as duplicate', `The reporter will see: "${reason}"`, 'Reject', true))) return;
    const r = await this.ui.busy(() => this.api.post<Report>(`reports/${this.id()}/reject`, { admin_remarks: reason }));
    if (r) {
      this.report.set(r);
      await this.ui.toast('Rejected as duplicate. The reporter has been notified.');
      await this.nav.navigateBack('/tabs/reports');
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
