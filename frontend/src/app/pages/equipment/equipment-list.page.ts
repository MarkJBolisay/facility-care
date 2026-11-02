import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CONDITIONS,
  Equipment,
  Facility,
  MAINTENANCE_STATES,
  equipmentIcon,
} from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

interface Summary {
  total: number;
  by_condition: Record<string, number>;
  maintenance: { overdue: number; due_soon: number; scheduled: number };
}

/** Equipment list with search and filters (category, condition, location, department, maintenance). */
@Component({
  selector: 'app-equipment-list',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        @if (!inTabs) {
          <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        }
        <ion-title>Equipment</ion-title>
      </ion-toolbar>
      <div class="filter-bar">
        <ion-searchbar placeholder="Name, ID, model or serial no." [debounce]="300" [(ngModel)]="search" (ionInput)="load()" />
        <ion-button fill="outline" size="small" (click)="showFilters.set(!showFilters())">
          <ion-icon slot="start" name="options-outline" /> Filter
          @if (activeFilters()) { <span class="filter-count">{{ activeFilters() }}</span> }
        </ion-button>
      </div>
      <div class="toolbar-chips">
        <ion-chip [outline]="condition !== ''" [color]="condition === '' ? 'primary' : 'medium'" (click)="setCondition('')">
          All {{ summary()?.total ?? '' }}
        </ion-chip>
        @for (c of conditions; track c.value) {
          <ion-chip [outline]="condition !== c.value" [color]="condition === c.value ? toneOf(c.value) : 'medium'" (click)="setCondition(c.value)">
            {{ c.label }} {{ summary()?.by_condition?.[c.value] ?? '' }}
          </ion-chip>
        }
      </div>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        @if (showFilters()) {
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Category" interface="action-sheet" [(ngModel)]="category" (ionChange)="load()">
                  <ion-select-option value="">Any category</ion-select-option>
                  @for (c of categories; track c.value) {
                    <ion-select-option [value]="c.value">{{ c.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Location" interface="action-sheet" [(ngModel)]="facilityId" (ionChange)="load()">
                  <ion-select-option [value]="0">Anywhere</ion-select-option>
                  @for (f of facilities(); track f.id) {
                    <ion-select-option [value]="f.id">{{ f.full_name }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select label="Preventive maintenance" interface="action-sheet" [(ngModel)]="maintenance" (ionChange)="load()">
                  <ion-select-option value="">Any</ion-select-option>
                  <ion-select-option value="due">Due or overdue</ion-select-option>
                  @for (m of maintenanceStates; track m.value) {
                    <ion-select-option [value]="m.value">{{ m.label }}</ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-input label="Department" labelPlacement="fixed" placeholder="e.g. ICT Department" [debounce]="400" [(ngModel)]="department" (ionInput)="load()" />
              </ion-item>
            </ion-list>
            @if (activeFilters()) {
              <ion-button fill="clear" size="small" (click)="clearFilters()">Clear filters</ion-button>
            }
          </div>
        }

        @if (summary(); as s) {
          @if (s.maintenance.overdue || s.maintenance.due_soon) {
            <a class="notice" routerLink="/preventive-maintenance">
              <ion-icon name="calendar-outline" />
              <span><strong>{{ s.maintenance.overdue }} overdue</strong> and {{ s.maintenance.due_soon }} due soon for preventive maintenance</span>
              <ion-icon name="chevron-forward-outline" />
            </a>
          }
        }

        <p class="small muted">{{ items().length }} item(s)</p>
        <ion-list class="cards">
          @for (e of items(); track e.id) {
            <ion-item button detail [routerLink]="['/equipment', e.id]">
              <div slot="start" class="eq-icon" [class]="'eq-icon tint-' + toneOf(e.condition)"><ion-icon [name]="icon(e.category)" /></div>
              <ion-label>
                <h3>{{ e.name }}</h3>
                <p>{{ e.code }}{{ e.model ? ' · ' + e.model : '' }}</p>
                <p><ion-icon name="location-outline" /> {{ e.facility?.full_name || 'No location' }}</p>
                <div class="pills">
                  <app-badge kind="condition" [value]="e.condition" />
                  @if (e.maintenance_state === 'overdue' || e.maintenance_state === 'due_soon') {
                    <app-badge kind="maintenance" [value]="e.maintenance_state" />
                  }
                  @if (e.open_requests_count) {
                    <ion-badge color="light" class="pill">{{ e.open_requests_count }} open request(s)</ion-badge>
                  }
                </div>
              </ion-label>
            </ion-item>
          } @empty {
            @if (!loading()) {
              <app-empty text="No equipment matches your search." icon="desktop-outline" />
            }
          }
        </ion-list>
        @if (loading() && !items().length) {
          <div class="ion-text-center"><ion-spinner /></div>
        }
      </div>

      @if (auth.isAdmin()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button routerLink="/equipment/new" aria-label="Add equipment"><ion-icon name="add-outline" /></ion-fab-button>
        </ion-fab>
      }
    </ion-content>
  `,
})
export class EquipmentListPage {
  /** Shown as a tab for admins; opened from a menu (with a back button) otherwise. */
  protected inTabs = inject(Router).url.startsWith('/tabs');
  private api = inject(ApiService);
  private ui = inject(UiService);
  private route = inject(ActivatedRoute);
  protected auth = inject(AuthService);

  protected categories = EQUIPMENT_CATEGORIES;
  protected conditions = EQUIPMENT_CONDITIONS;
  protected maintenanceStates = MAINTENANCE_STATES.filter((m) => m.value !== 'none');

  search = '';
  condition = '';
  category = '';
  facilityId = 0;
  maintenance = '';
  department = '';

  protected items = signal<Equipment[]>([]);
  protected facilities = signal<Facility[]>([]);
  protected summary = signal<Summary | null>(null);
  protected loading = signal(false);
  protected showFilters = signal(false);
  protected filterTick = signal(0);
  private appliedQuery = '';

  protected activeFilters = computed(() => {
    this.filterTick();
    return [this.category, this.facilityId, this.maintenance, this.department].filter((v) => !!v).length;
  });

  protected icon = equipmentIcon;
  protected toneOf(condition: string): string {
    return { operational: 'success', needs_repair: 'warning', under_maintenance: 'primary', out_of_service: 'danger' }[condition] ?? 'medium';
  }

  ionViewWillEnter(): void {
    const q = this.route.snapshot.queryParamMap;
    const key = q.toString();
    if (key && key !== this.appliedQuery) {
      this.condition = q.get('condition') ?? '';
      this.maintenance = q.get('maintenance') ?? '';
      this.category = q.get('category') ?? '';
    }
    this.appliedQuery = key;
    if (!this.facilities().length) {
      this.api.get<Facility[]>('facilities').then((f) => this.facilities.set(f), () => undefined);
    }
    void this.load();
  }

  setCondition(value: string): void {
    this.condition = value;
    void this.load();
  }

  clearFilters(): void {
    this.category = '';
    this.facilityId = 0;
    this.maintenance = '';
    this.department = '';
    void this.load();
  }

  async load(event?: Event): Promise<void> {
    this.loading.set(true);
    this.filterTick.update((n) => n + 1);
    try {
      const [items, summary] = await Promise.all([
        this.api.get<Equipment[]>('equipment', {
          search: this.search,
          condition: this.condition,
          category: this.category,
          facility_id: this.facilityId || '',
          maintenance: this.maintenance,
          department: this.department,
        }),
        this.auth.isAdmin() || this.auth.isMaintenance() ? this.api.get<Summary>('equipment/summary') : Promise.resolve(null),
      ]);
      this.items.set(items);
      this.summary.set(summary);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
      completeRefresh(event);
    }
  }
}
