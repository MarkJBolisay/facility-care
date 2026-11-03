import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Paginated, Report } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { ReportCardComponent } from '../../shared/report-card';
import { completeRefresh } from '../../shared/ui';

/** Filter chips. "In Progress" covers approved reports too (accepted, waiting for or under repair). */
const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'approved,in_progress' },
  { label: 'Resolved', value: 'completed' },
];

/**
 * Students / faculty / staff: their own reports.
 * Phone: one column. Laptop (900px+): cards in a grid. (Admins use reports.page.ts.)
 */
@Component({
  selector: 'app-my-reports',
  imports: [...IONIC, FormsModule, ReportCardComponent],
  template: `
    <ion-header class="rp-head-wrap">
      <div class="rp-head">
        <div class="rp-head-in"><h1>My Reports</h1></div>
      </div>
    </ion-header>

    <ion-content class="rp rp-sheeted">
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)"><ion-refresher-content /></ion-refresher>

      <div class="rp-page">
        <div class="rp-tools">
          <div class="rp-chips" role="tablist" aria-label="Filter by status">
            @for (f of filters; track f.value) {
              <button type="button" role="tab" [attr.aria-selected]="status === f.value" [class.active]="status === f.value" (click)="setStatus(f.value)">
                {{ f.label }}
              </button>
            }
          </div>
          <label class="rp-search">
            <ion-icon name="search-outline" />
            <input type="search" placeholder="Search report..." aria-label="Search report" [(ngModel)]="search" (ngModelChange)="searchChanged()" />
          </label>
        </div>

        <div class="rp-grid">
          @for (r of items(); track r.id) {
            <app-report-card [report]="r" />
          }
        </div>

        @if (!loading() && !items().length) {
          <div class="rp-empty">
            <ion-icon name="document-text-outline" />
            <strong>{{ search || status ? 'No matching reports' : 'No reports yet' }}</strong>
            <span>{{ search || status ? 'Try another filter or search word.' : 'Your reported issues will appear here.' }}</span>
          </div>
        }
        @if (loading() && !items().length) {
          <div class="ion-text-center"><ion-spinner /></div>
        }

        <ion-infinite-scroll [disabled]="page() >= lastPage()" (ionInfinite)="more($event)">
          <ion-infinite-scroll-content />
        </ion-infinite-scroll>
      </div>
    </ion-content>
  `,
})
export class MyReportsPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private route = inject(ActivatedRoute);

  protected readonly filters = FILTERS;
  search = '';
  status = '';
  private appliedStatus: string | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected items = signal<Report[]>([]);
  protected page = signal(1);
  protected lastPage = signal(1);
  protected loading = signal(false);

  ionViewWillEnter(): void {
    // Links from the home screen preselect a status (?status=…), applied once per link
    const qs = this.route.snapshot.queryParamMap.get('status');
    if (qs !== null && qs !== this.appliedStatus) this.status = qs;
    this.appliedStatus = qs;
    void this.reload();
  }

  setStatus(value: string): void {
    this.status = value;
    void this.reload();
  }

  searchChanged(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.reload(), 400);
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
      const res = await this.api.get<Paginated<Report>>('reports', { page, search: this.search, status: this.status });
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
