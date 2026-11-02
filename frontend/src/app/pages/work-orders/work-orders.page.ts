import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Facility, PRIORITIES, Paginated, User, WORK_ORDER_STATUSES, WORK_ORDER_TYPES, WorkOrder } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

/**
 * scope=all     → admin work order management
 * scope=active  → maintenance "My Tasks" (pending + in progress)
 * scope=history → maintenance completed/previous tasks
 */
@Component({
  selector: 'app-work-orders',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
      <div class="filter-bar">
        <ion-searchbar placeholder="Title, reference or equipment" [debounce]="400" [(ngModel)]="search" (ionInput)="reload()" />
        <ion-button fill="outline" size="small" (click)="showFilters.set(!showFilters())">
          <ion-icon slot="start" name="options-outline" /> Filter
          @if (filterCount()) { <span class="filter-count">{{ filterCount() }}</span> }
        </ion-button>
      </div>
      @if (scope === 'all') {
        <div class="toolbar-chips">
          <ion-chip [outline]="status !== '' || attention !== ''" [color]="status === '' && attention === '' ? 'primary' : 'medium'" (click)="setStatus('')">All</ion-chip>
          <ion-chip [outline]="attention !== 'unassigned'" [color]="attention === 'unassigned' ? 'tertiary' : 'medium'" (click)="setAttention('unassigned')">Unassigned</ion-chip>
          <ion-chip [outline]="attention !== 'overdue'" [color]="attention === 'overdue' ? 'danger' : 'medium'" (click)="setAttention('overdue')">Overdue</ion-chip>
          @for (s of statuses; track s.value) {
            <ion-chip [outline]="status !== s.value" [color]="status === s.value ? 'primary' : 'medium'" (click)="setStatus(s.value)">{{ s.label }}</ion-chip>
          }
        </div>
      } @else if (scope === 'active') {
        <div class="toolbar-chips">
          <ion-chip [outline]="priority !== ''" [color]="priority === '' ? 'primary' : 'medium'" (click)="setPriority('')">Any priority</ion-chip>
          @for (p of priorities; track p.value) {
            <ion-chip [outline]="priority !== p.value" [color]="priority === p.value ? 'primary' : 'medium'" (click)="setPriority(p.value)">{{ p.label }}</ion-chip>
          }
        </div>
      }
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        @if (showFilters()) {
          <div class="panel">
            <ion-list lines="full">
              @if (scope === 'all') {
                <ion-item>
                  <ion-select label="Technician" interface="action-sheet" [(ngModel)]="technicianId" (ionChange)="reload()">
                    <ion-select-option [value]="0">Anyone</ion-select-option>
                    @for (t of technicians(); track t.id) {
                      <ion-select-option [value]="t.id">{{ t.name }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              }
              <ion-item>
                <ion-select label="Location" interface="action-sheet" [(ngModel)]="facilityId" (ionChange)="reload()">
                  <ion-select-option [value]="0">Anywhere</ion-select-option>
                  @for (f of facilities(); track f.id) {
                    <ion-select-option [value]="f.id">{{ f.full_name }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Type" interface="popover" [(ngModel)]="type" (ionChange)="reload()">
                  <ion-select-option value="">Any</ion-select-option>
                  @for (t of types; track t.value) {
                    <ion-select-option [value]="t.value">{{ t.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input label="From" labelPlacement="fixed" type="date" [(ngModel)]="from" (ionChange)="reload()" />
              </ion-item>
              <ion-item>
                <ion-input label="To" labelPlacement="fixed" type="date" [(ngModel)]="to" (ionChange)="reload()" />
              </ion-item>
            </ion-list>
            @if (filterCount()) {
              <ion-button fill="clear" size="small" (click)="clearFilters()">Clear filters</ion-button>
            }
          </div>
        }
        <ion-list class="cards">
          @for (w of items(); track w.id) {
            <ion-item button detail [routerLink]="['/work-orders', w.id]">
              @if (w.report?.photo_url) {
                <ion-thumbnail slot="start"><img [src]="w.report.photo_url" alt="" loading="lazy" /></ion-thumbnail>
              }
              <ion-label>
                <h3>{{ w.title }}</h3>
                <p>{{ w.reference }}{{ w.report ? ' · ' + w.report.reference : '' }}</p>
                <p><ion-icon name="location-outline" /> {{ w.facility?.full_name || 'No location' }}</p>
                @if (w.equipment) {
                  <p><ion-icon name="desktop-outline" /> {{ w.equipment.name }} ({{ w.equipment.code }})</p>
                }
                @if (scope === 'all') {
                  <p><ion-icon name="person-outline" /> {{ w.assignee?.name || 'Unassigned' }}</p>
                }
                @if (scope === 'history' && w.completed_at) {
                  <p><ion-icon name="checkmark-done-outline" /> {{ w.completed_at | ago }}</p>
                } @else if (w.due_date && w.status !== 'completed' && w.status !== 'cancelled') {
                  <p [class.overdue]="isOverdue(w)">
                    <ion-icon name="calendar-outline" /> Due {{ w.due_date }}{{ isOverdue(w) ? ' — overdue' : '' }}
                  </p>
                }
                <div class="pills">
                  <app-badge kind="status" [value]="w.status" />
                  <app-badge kind="priority" [value]="w.priority" />
                  @if (w.type === 'preventive') { <ion-badge color="tertiary" class="pill">Preventive</ion-badge> }
                </div>
              </ion-label>
            </ion-item>
          } @empty {
            @if (!loading()) {
              <app-empty [text]="scope === 'active' ? 'No assigned tasks.' : 'No work orders found.'" icon="hammer-outline" />
            }
          }
        </ion-list>
        @if (loading() && !items().length) {
          <div class="ion-text-center"><ion-spinner /></div>
        }
        <ion-infinite-scroll [disabled]="page() >= lastPage()" (ionInfinite)="more($event)">
          <ion-infinite-scroll-content />
        </ion-infinite-scroll>
      </div>

      @if (auth.isAdmin()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button routerLink="/work-orders/new"><ion-icon name="add-outline" /></ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
  styles: [`.overdue { color: var(--ion-color-danger) !important; }`],
})
export class WorkOrdersPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  protected auth = inject(AuthService);

  private route = inject(ActivatedRoute);
  protected scope: 'all' | 'active' | 'history' = this.route.snapshot.data['scope'] ?? 'all';
  protected title = { all: 'Work Orders', active: 'My Tasks', history: 'Maintenance History' }[this.scope];
  protected statuses = WORK_ORDER_STATUSES;
  protected types = WORK_ORDER_TYPES;
  protected facilities = signal<Facility[]>([]);
  protected technicians = signal<User[]>([]);
  protected showFilters = signal(false);
  protected filterCount = signal(0);
  technicianId = 0;
  facilityId = 0;
  type = '';
  from = '';
  to = '';
  protected priorities = PRIORITIES;

  search = '';
  status = '';
  attention = '';
  priority = '';
  private appliedQuery = '';
  protected items = signal<WorkOrder[]>([]);
  protected page = signal(1);
  protected lastPage = signal(1);
  protected loading = signal(false);

  ionViewWillEnter(): void {
    // Links from the dashboard can preselect a filter (?status=… or ?attention=…)
    // (applied once per link, so a filter picked here isn't overwritten when coming back)
    const q = this.route.snapshot.queryParamMap;
    const key = `${q.get('status')}|${q.get('attention')}`;
    if ((q.has('status') || q.has('attention')) && key !== this.appliedQuery) {
      this.status = q.get('status') ?? '';
      this.attention = q.get('attention') ?? '';
    }
    this.appliedQuery = key;
    if (!this.facilities().length) {
      this.api.get<Facility[]>('facilities').then((f) => this.facilities.set(f), () => undefined);
      if (this.auth.isAdmin()) this.api.get<User[]>('technicians').then((t) => this.technicians.set(t), () => undefined);
    }
    void this.reload();
  }

  setStatus(v: string): void {
    this.status = v;
    this.attention = '';
    void this.reload();
  }

  /** Open work orders without personnel, or past their due date. */
  setAttention(v: string): void {
    this.attention = this.attention === v ? '' : v;
    this.status = '';
    void this.reload();
  }

  clearFilters(): void {
    this.technicianId = 0;
    this.facilityId = 0;
    this.type = '';
    this.from = '';
    this.to = '';
    void this.reload();
  }

  setPriority(v: string): void {
    this.priority = v;
    void this.reload();
  }

  isOverdue(w: WorkOrder): boolean {
    return !!w.due_date && w.due_date < new Date().toISOString().slice(0, 10);
  }

  async reload(event?: Event): Promise<void> {
    await this.fetch(1);
    completeRefresh(event);
  }

  async more(event: Event): Promise<void> {
    await this.fetch(this.page() + 1);
    completeRefresh(event);
  }

  private async fetch(page: number): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.get<Paginated<WorkOrder>>('work-orders', {
        page,
        search: this.search,
        status: this.status,
        attention: this.attention,
        priority: this.priority,
        scope: this.scope === 'all' ? '' : this.scope,
        assigned_to: this.technicianId || '',
        facility_id: this.facilityId || '',
        type: this.type,
        from: this.from,
        to: this.to,
      });
      this.filterCount.set([this.technicianId, this.facilityId, this.type, this.from, this.to].filter((v) => !!v).length);
      this.items.set(page === 1 ? res.data : [...this.items(), ...res.data]);
      this.page.set(res.current_page);
      this.lastPage.set(res.last_page);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
