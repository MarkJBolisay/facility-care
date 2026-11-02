import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { ActivityLog, Paginated, User } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { ActivityComponent } from '../../shared/activity';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

/** Repair request and activity history for the whole system, with filters. */
@Component({
  selector: 'app-activity-page',
  imports: [...IONIC, ...SHARED, FormsModule, ActivityComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        <ion-title>Activity History</ion-title>
      </ion-toolbar>
      <div class="filter-bar">
        <ion-searchbar placeholder="Reference, equipment or text" [debounce]="300" [(ngModel)]="search" (ionInput)="reload()" />
        <ion-button fill="outline" size="small" (click)="showFilters.set(!showFilters())">
          <ion-icon slot="start" name="options-outline" /> Filter
        </ion-button>
      </div>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        @if (showFilters()) {
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Action" interface="action-sheet" [(ngModel)]="action" (ionChange)="reload()">
                  <ion-select-option value="">Any action</ion-select-option>
                  @for (a of actions; track a.value) {
                    <ion-select-option [value]="a.value">{{ a.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Done by" interface="action-sheet" [(ngModel)]="userId" (ionChange)="reload()">
                  <ion-select-option [value]="0">Anyone</ion-select-option>
                  @for (u of people(); track u.id) {
                    <ion-select-option [value]="u.id">{{ u.name }} ({{ u.role | label: 'role' }})</ion-select-option>
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
            <ion-button fill="clear" size="small" (click)="clear()">Clear filters</ion-button>
          </div>
        }

        <p class="small muted">{{ total() }} entr{{ total() === 1 ? 'y' : 'ies' }}</p>
        <div class="panel"><app-activity [items]="items()" [showLinks]="true" /></div>

        <ion-infinite-scroll [disabled]="page() >= lastPage()" (ionInfinite)="more($event)">
          <ion-infinite-scroll-content />
        </ion-infinite-scroll>
      </div>
    </ion-content>
  `,
})
export class ActivityPage {
  private api = inject(ApiService);
  private ui = inject(UiService);

  protected actions = [
    { value: 'submitted', label: 'Request submitted' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'work_order_created', label: 'Work order created' },
    { value: 'scheduled', label: 'Preventive maintenance scheduled' },
    { value: 'assigned', label: 'Assigned / reassigned' },
    { value: 'status_changed', label: 'Status changed' },
    { value: 'completed', label: 'Repair completed' },
    { value: 'condition_changed', label: 'Equipment condition changed' },
    { value: 'priority_changed', label: 'Priority changed' },
    { value: 'equipment_added', label: 'Equipment added' },
  ];

  search = '';
  action = '';
  userId = 0;
  from = '';
  to = '';
  protected showFilters = signal(false);
  protected items = signal<ActivityLog[]>([]);
  protected people = signal<User[]>([]);
  protected page = signal(1);
  protected lastPage = signal(1);
  protected total = signal(0);

  ionViewWillEnter(): void {
    if (!this.people().length) {
      this.api.get<Paginated<User>>('users', { per_page: 200 }).then(
        (res) => this.people.set(res.data.filter((u) => u.role === 'admin' || u.role === 'maintenance')),
        () => undefined,
      );
    }
    void this.reload();
  }

  clear(): void {
    this.action = '';
    this.userId = 0;
    this.from = '';
    this.to = '';
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
    try {
      const res = await this.api.get<Paginated<ActivityLog>>('activity', {
        page,
        search: this.search,
        action: this.action,
        user_id: this.userId || '',
        from: this.from,
        to: this.to,
      });
      this.items.set(page === 1 ? res.data : [...this.items(), ...res.data]);
      this.page.set(res.current_page);
      this.lastPage.set(res.last_page);
      this.total.set(res.total);
    } catch (err) {
      await this.ui.error(err);
    }
  }
}
