import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { FACILITY_TYPES, Facility } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

interface Group {
  building: Facility | null;
  items: Facility[];
}

@Component({
  selector: 'app-facilities',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        @if (!inTabs) {
          <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        }
        <ion-title>Facility Management</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Search name or code" [debounce]="250" [ngModel]="search()" (ngModelChange)="search.set($event)" />
      </ion-toolbar>
      <div class="toolbar-chips">
        <ion-chip [outline]="type() !== ''" [color]="type() === '' ? 'primary' : 'medium'" (click)="type.set('')">All</ion-chip>
        @for (t of types; track t.value) {
          <ion-chip [outline]="type() !== t.value" [color]="type() === t.value ? 'primary' : 'medium'" (click)="type.set(t.value)">{{ t.label }}</ion-chip>
        }
      </div>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        @for (g of groups(); track g.building?.id ?? 0) {
          @if (g.building) {
            <ion-list class="cards">
              <ion-item button detail [routerLink]="['/facilities', g.building.id]" class="building">
                <ion-icon slot="start" name="business-outline" color="primary" />
                <ion-label>
                  <h2><strong>{{ g.building.name }}</strong></h2>
                  <p>{{ g.building.code }} · {{ g.items.length }} room(s)/area(s)</p>
                  <div class="pills"><app-badge kind="status" [value]="g.building.status" /></div>
                </ion-label>
              </ion-item>
            </ion-list>
          } @else {
            <div class="section-title">Other areas</div>
          }
          <ion-list class="cards nested">
            @for (f of g.items; track f.id) {
              <ion-item button detail [routerLink]="['/facilities', f.id]">
                <ion-label>
                  <h3>{{ f.name }}</h3>
                  <p>{{ f.type | label: 'facilityType' }}{{ f.floor ? ' · ' + f.floor + ' floor' : '' }}{{ f.code ? ' · ' + f.code : '' }}</p>
                  <div class="pills">
                    @if (f.status !== 'operational') {
                      <app-badge kind="status" [value]="f.status" />
                    }
                    @if (f.open_reports_count) {
                      <ion-badge color="warning" class="pill">{{ f.open_reports_count }} open issue(s)</ion-badge>
                    }
                    @if (f.total_work_orders_count) {
                      <ion-badge color="light" class="pill">{{ f.total_work_orders_count }} repair(s)</ion-badge>
                    }
                  </div>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        } @empty {
          @if (loaded()) {
            <app-empty text="No facilities found." icon="business-outline" />
          } @else {
            <div class="ion-text-center"><ion-spinner /></div>
          }
        }
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button routerLink="/facilities/new"><ion-icon name="add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: [`.nested { margin-left: 18px; } .building { --background: var(--fc-surface); }`],
})
export class FacilitiesPage {
  /** Shown as a tab for admins; opened from a menu (with a back button) otherwise. */
  protected inTabs = inject(Router).url.startsWith('/tabs');
  private api = inject(ApiService);
  private ui = inject(UiService);

  protected types = FACILITY_TYPES;
  protected all = signal<Facility[]>([]);
  protected loaded = signal(false);
  protected search = signal('');
  protected type = signal('');

  /** Buildings with their rooms underneath; filters apply to everything. */
  protected groups = computed<Group[]>(() => {
    const q = this.search().toLowerCase().trim();
    const t = this.type();
    const match = (f: Facility) =>
      (!t || f.type === t) && (!q || f.name.toLowerCase().includes(q) || (f.code ?? '').toLowerCase().includes(q));

    const list = this.all();
    const groups: Group[] = list
      .filter((f) => f.type === 'building')
      .map((b) => ({ building: b, items: list.filter((f) => f.parent_id === b.id && match(f)) }))
      .filter((g) => g.items.length || match(g.building!));

    const loose = list.filter((f) => !f.parent_id && f.type !== 'building' && match(f));
    if (loose.length) groups.push({ building: null, items: loose });
    return groups;
  });

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(event?: Event): Promise<void> {
    try {
      this.all.set(await this.api.get<Facility[]>('facilities'));
      this.loaded.set(true);
    } catch (err) {
      await this.ui.error(err);
    } finally {
      completeRefresh(event);
    }
  }
}
