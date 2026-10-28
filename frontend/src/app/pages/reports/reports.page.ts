import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CATEGORIES, PRIORITIES, Paginated, REPORT_STATUSES, Report } from '../../core/models';
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
        <ion-title>{{ auth.isAdmin() ? 'Report Management' : 'My Reports' }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          placeholder="Search title or reference"
          [debounce]="400"
          [(ngModel)]="search"
          (ionInput)="reload()"
        />
      </ion-toolbar>
      <div class="toolbar-chips">
        <ion-chip [outline]="status !== ''" [color]="status === '' ? 'primary' : 'medium'" (click)="setStatus('')">All</ion-chip>
        @for (s of statuses; track s.value) {
          <ion-chip [outline]="status !== s.value" [color]="status === s.value ? 'primary' : 'medium'" (click)="setStatus(s.value)">
            {{ s.label }}
          </ion-chip>
        }
      </div>
      @if (auth.isAdmin()) {
        <div class="toolbar-chips">
          <ion-select [(ngModel)]="category" (ionChange)="reload()" interface="popover" placeholder="Any category" label="Category" labelPlacement="start">
            <ion-select-option value="">Any</ion-select-option>
            @for (c of categories; track c.value) {
              <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
            }
          </ion-select>
          <ion-select [(ngModel)]="priority" (ionChange)="reload()" interface="popover" placeholder="Any priority" label="Priority" labelPlacement="start">
            <ion-select-option value="">Any</ion-select-option>
            @for (p of priorities; track p.value) {
              <ion-select-option [value]="p.value">{{ p.label }}</ion-select-option>
            }
          </ion-select>
        </div>
      }
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)"><ion-refresher-content /></ion-refresher>

      <div class="max">
        @if (total() !== null) {
          <p class="muted small mt-0">{{ total() }} report(s)</p>
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
                <p><ion-icon name="location-outline" /> {{ r.facility?.full_name || r.location_details || 'No location' }}</p>
                @if (auth.isAdmin() && r.reporter) {
                  <p><ion-icon name="person-outline" /> {{ r.reporter.name }} ({{ r.reporter.role | label: 'role' }})</p>
                }
                <div class="pills">
                  <app-badge kind="status" [value]="r.status" />
                  @if (r.priority) {
                    <app-badge kind="priority" [value]="r.priority" />
                  }
                  @if (r.category) {
                    <ion-badge color="light" class="pill">{{ r.category | label: 'category' }}</ion-badge>
                  }
                  @if (r.active_work_order?.assignee) {
                    <ion-badge color="light" class="pill">👷 {{ r.active_work_order.assignee.name }}</ion-badge>
                  }
                </div>
              </ion-label>
            </ion-item>
          } @empty {
            @if (!loading()) {
              <app-empty text="No reports found." icon="document-text-outline" />
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

  search = '';
  status = '';
  category = '';
  priority = '';
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
      });
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
