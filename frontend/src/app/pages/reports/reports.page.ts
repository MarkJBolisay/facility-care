import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CATEGORIES, Facility, PRIORITIES, Paginated, REPORT_STATUSES, Report, SEVERITIES, User } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

/** Admin: all submitted reports. Students/faculty/staff: their own reports. */
@Component({
  selector: 'app-reports',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ auth.isAdmin() ? 'Repair Requests' : 'My Requests' }}</ion-title>
      </ion-toolbar>
      <div class="filter-bar">
        <ion-searchbar
          placeholder="Title, reference or equipment"
          [debounce]="400"
          [(ngModel)]="search"
          (ionInput)="reload()"
        />
        @if (auth.isAdmin()) {
          <ion-button fill="outline" size="small" (click)="showFilters.set(!showFilters())">
            <ion-icon slot="start" name="options-outline" /> Filter
            @if (filterCount()) { <span class="filter-count">{{ filterCount() }}</span> }
          </ion-button>
        }
      </div>
      <div class="toolbar-chips">
        <ion-chip [outline]="status !== ''" [color]="status === '' ? 'primary' : 'medium'" (click)="setStatus('')">All</ion-chip>
        @for (s of statuses; track s.value) {
          <ion-chip [outline]="status !== s.value" [color]="status === s.value ? 'primary' : 'medium'" (click)="setStatus(s.value)">
            {{ s.label }}
          </ion-chip>
        }
      </div>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)"><ion-refresher-content /></ion-refresher>

      <div class="max">
        @if (auth.isAdmin() && showFilters()) {
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Location" interface="action-sheet" [(ngModel)]="facilityId" (ionChange)="reload()">
                  <ion-select-option [value]="0">Anywhere</ion-select-option>
                  @for (f of facilities(); track f.id) {
                    <ion-select-option [value]="f.id">{{ f.full_name }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Technician" interface="action-sheet" [(ngModel)]="technicianId" (ionChange)="reload()">
                  <ion-select-option [value]="0">Anyone</ion-select-option>
                  @for (t of technicians(); track t.id) {
                    <ion-select-option [value]="t.id">{{ t.name }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Category" interface="action-sheet" [(ngModel)]="category" (ionChange)="reload()">
                  <ion-select-option value="">Any</ion-select-option>
                  @for (c of categories; track c.value) {
                    <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Priority" interface="action-sheet" [(ngModel)]="priority" (ionChange)="reload()">
                  <ion-select-option value="">Any</ion-select-option>
                  @for (p of priorities; track p.value) {
                    <ion-select-option [value]="p.value">{{ p.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Severity" interface="action-sheet" [(ngModel)]="severity" (ionChange)="reload()">
                  <ion-select-option value="">Any</ion-select-option>
                  @for (v of severities; track v.value) {
                    <ion-select-option [value]="v.value">{{ v.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input label="From" labelPlacement="fixed" type="date" [(ngModel)]="from" (ionChange)="reload()" />
              </ion-item>
              <ion-item>
                <ion-input label="To" labelPlacement="fixed" type="date" [(ngModel)]="to" (ionChange)="reload()" />
              </ion-item>
              <ion-item>
                <ion-toggle [(ngModel)]="sortByScore" (ionChange)="reload()">Highest priority score first</ion-toggle>
              </ion-item>
            </ion-list>
            @if (filterCount()) {
              <ion-button fill="clear" size="small" (click)="clearFilters()">Clear filters</ion-button>
            }
          </div>
        }
        @if (total() !== null) {
          <p class="muted small mt-0">{{ total() }} request(s){{ sortByScore ? ' · sorted by priority score' : '' }}</p>
        }
        <ion-list class="cards">
          @for (r of items(); track r.id) {
            <ion-item button detail [routerLink]="['/reports', r.id]">
              @if (r.photo_url) {
                <ion-thumbnail slot="start"><img [src]="r.photo_url" alt="" loading="lazy" /></ion-thumbnail>
              }
              <ion-label>
                <h3>{{ r.title }}</h3>
                <p>{{ r.reference }} · {{ r.created_at | ago }}</p>
                <p><ion-icon name="location-outline" /> {{ r.facility?.full_name || (r.location_details ? '' : 'No location') }}{{ r.location_details ? (r.facility ? ' – ' : '') + r.location_details : '' }}</p>
                @if (r.equipment) {
                  <p><ion-icon name="desktop-outline" /> {{ r.equipment.name }} ({{ r.equipment.code }})</p>
                }
                @if (auth.isAdmin() && r.reporter) {
                  <p><ion-icon name="person-outline" /> {{ r.reporter.name }} ({{ r.reporter.role | label: 'role' }})</p>
                }
                <div class="pills">
                  <app-badge kind="status" [value]="r.status" />
                  @if (r.priority) {
                    <app-badge kind="priority" [value]="r.priority" />
                  }
                  @if (auth.isAdmin() && r.status === 'pending' && r.priority_score !== undefined) {
                    <span class="score-pill" title="Recommended priority score"><ion-icon name="sparkles" />{{ r.priority_score }}</span>
                  }
                  @if (r.category) {
                    <ion-badge color="light" class="pill">{{ r.category | label: 'category' }}{{ r.category === 'others' && r.category_other ? ': ' + r.category_other : '' }}</ion-badge>
                  }
                  @if (r.active_work_order?.assignee) {
                    <ion-badge color="light" class="pill">{{ r.active_work_order.assignee.name }}</ion-badge>
                  }
                </div>
              </ion-label>
            </ion-item>
          } @empty {
            @if (!loading()) {
              <app-empty text="No requests found." icon="document-text-outline" />
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

      @if (!auth.isAdmin()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button routerLink="/tabs/new-report"><ion-icon name="add-outline" /></ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
})
export class ReportsPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private route = inject(ActivatedRoute);
  protected auth = inject(AuthService);

  protected statuses = REPORT_STATUSES;
  protected categories = CATEGORIES;
  protected priorities = PRIORITIES;
  protected severities = SEVERITIES;
  protected facilities = signal<Facility[]>([]);
  protected technicians = signal<User[]>([]);
  protected showFilters = signal(false);
  protected filterCount = signal(0);

  search = '';
  status = '';
  category = '';
  priority = '';
  severity = '';
  facilityId = 0;
  technicianId = 0;
  from = '';
  to = '';
  sortByScore = false;
  private appliedStatus: string | null = null;

  protected items = signal<Report[]>([]);
  protected page = signal(1);
  protected lastPage = signal(1);
  protected total = signal<number | null>(null);
  protected loading = signal(false);

  ionViewWillEnter(): void {
    // Links from the dashboard can preselect a status (?status=…). Applied once per link,
    // so a filter picked here isn't overwritten when coming back from a report.
    const qs = this.route.snapshot.queryParamMap.get('status');
    if (qs !== null && qs !== this.appliedStatus) this.status = qs;
    this.appliedStatus = qs;
    if (this.auth.isAdmin() && !this.facilities().length) {
      this.api.get<Facility[]>('facilities').then((f) => this.facilities.set(f), () => undefined);
      this.api.get<User[]>('technicians').then((t) => this.technicians.set(t), () => undefined);
    }
    void this.reload();
  }

  clearFilters(): void {
    this.category = '';
    this.priority = '';
    this.severity = '';
    this.facilityId = 0;
    this.technicianId = 0;
    this.from = '';
    this.to = '';
    this.sortByScore = false;
    void this.reload();
  }

  setStatus(value: string): void {
    this.status = value;
    void this.reload();
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
      const res = await this.api.get<Paginated<Report>>('reports', {
        page,
        search: this.search,
        status: this.status,
        category: this.category,
        priority: this.priority,
        severity: this.severity,
        facility_id: this.facilityId || '',
        assigned_to: this.technicianId || '',
        from: this.from,
        to: this.to,
        sort: this.sortByScore ? 'score' : '',
      });
      this.filterCount.set(
        [this.category, this.priority, this.severity, this.facilityId, this.technicianId, this.from, this.to, this.sortByScore].filter((v) => !!v).length,
      );
      this.items.set(page === 1 ? res.data : [...this.items(), ...res.data]);
      this.page.set(res.current_page);
      this.lastPage.set(res.last_page);
      this.total.set(res.total);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
