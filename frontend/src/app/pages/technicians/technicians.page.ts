import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CATEGORIES, User } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { initials } from '../../shared/dash';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

/** Technician account management: profiles, specializations, availability and workload. */
@Component({
  selector: 'app-technicians',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        <ion-title>Technicians</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Search name or email" [debounce]="300" [(ngModel)]="search" (ionInput)="load()" />
      </ion-toolbar>
      <div class="toolbar-chips">
        <ion-chip [outline]="specialization !== ''" [color]="specialization === '' ? 'primary' : 'medium'" (click)="setSpec('')">All</ion-chip>
        @for (c of categories; track c.value) {
          <ion-chip [outline]="specialization !== c.value" [color]="specialization === c.value ? 'primary' : 'medium'" (click)="setSpec(c.value)">{{ c.label }}</ion-chip>
        }
      </div>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        <ion-list class="cards">
          @for (t of items(); track t.id) {
            <ion-item button detail [routerLink]="['/technicians', t.id]">
              <div slot="start" class="tech-avatar" [class.off]="!t.is_available || !t.is_active">{{ initialsOf(t.name) }}<i></i></div>
              <ion-label>
                <h3>{{ t.name }} @if (!t.is_active) { <span class="muted small">(inactive)</span> }</h3>
                <p>{{ t.specialization | label: 'category' }} · {{ t.is_available ? 'Available' : 'Not available' }}</p>
                <div class="pills">
                  <ion-badge [color]="t.active_count ? 'primary' : 'light'" class="pill">{{ t.active_count }} active</ion-badge>
                  @if (t.overdue_count) { <ion-badge color="danger" class="pill">{{ t.overdue_count }} overdue</ion-badge> }
                  <ion-badge color="light" class="pill">{{ t.completed_month_count }} done this month</ion-badge>
                </div>
              </ion-label>
            </ion-item>
          } @empty {
            <app-empty text="No technicians found." icon="people-outline" />
          }
        </ion-list>
        <p class="small muted ion-text-center">To add a technician, create a user with the Technician role in User Management.</p>
      </div>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button routerLink="/users/new" [queryParams]="{ role: 'maintenance' }" aria-label="Add technician"><ion-icon name="person-add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class TechniciansPage {
  private api = inject(ApiService);
  private ui = inject(UiService);

  protected categories = CATEGORIES;
  protected items = signal<User[]>([]);
  protected initialsOf = initials;
  search = '';
  specialization = '';

  ionViewWillEnter(): void {
    void this.load();
  }

  setSpec(value: string): void {
    this.specialization = value;
    void this.load();
  }

  async load(event?: Event): Promise<void> {
    try {
      this.items.set(await this.api.get<User[]>('technicians', { search: this.search, specialization: this.specialization }));
    } catch (err) {
      await this.ui.error(err);
    } finally {
      completeRefresh(event);
    }
  }
}
