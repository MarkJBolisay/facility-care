import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Paginated, ROLES, User } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

@Component({
  selector: 'app-users',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        <ion-title>User Management</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Search name, email or ID" [debounce]="400" [(ngModel)]="search" (ionInput)="reload()" />
      </ion-toolbar>
      <div class="toolbar-chips">
        <ion-chip [outline]="role !== ''" [color]="role === '' ? 'primary' : 'medium'" (click)="setRole('')">All ({{ totalAll() }})</ion-chip>
        @for (r of roles; track r.value) {
          <ion-chip [outline]="role !== r.value" [color]="role === r.value ? 'primary' : 'medium'" (click)="setRole(r.value)">
            {{ r.label }} ({{ counts()[r.value] || 0 }})
          </ion-chip>
        }
      </div>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        <ion-list class="cards">
          @for (u of items(); track u.id) {
            <ion-item button detail [routerLink]="['/users', u.id]">
              <ion-icon slot="start" [name]="u.role === 'maintenance' ? 'construct-outline' : 'person-circle-outline'" [color]="u.is_active ? 'primary' : 'medium'" />
              <ion-label>
                <h3>{{ u.name }}</h3>
                <p>{{ u.email }}</p>
                <p>{{ u.role | label: 'role' }}{{ u.department ? ' · ' + u.department : '' }}{{ u.id_number ? ' · ' + u.id_number : '' }}</p>
              </ion-label>
              @if (!u.is_active) {
                <ion-badge slot="end" color="medium">Inactive</ion-badge>
              }
            </ion-item>
          } @empty {
            <app-empty text="No users found." icon="people-outline" />
          }
        </ion-list>
        <ion-infinite-scroll [disabled]="page() >= lastPage()" (ionInfinite)="more($event)">
          <ion-infinite-scroll-content />
        </ion-infinite-scroll>
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button routerLink="/users/new"><ion-icon name="person-add-outline" /></ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class UsersPage {
  private api = inject(ApiService);
  private ui = inject(UiService);

  protected roles = ROLES;
  search = '';
  role = '';
  protected items = signal<User[]>([]);
  protected counts = signal<Record<string, number>>({});
  protected totalAll = signal(0);
  protected page = signal(1);
  protected lastPage = signal(1);

  ionViewWillEnter(): void {
    void this.reload();
  }

  setRole(r: string): void {
    this.role = r;
    void this.reload();
  }

  async reload(event?: Event): Promise<void> {
    await this.fetch(1);
    try {
      const counts = await this.api.get<Record<string, number>>('users/counts');
      this.counts.set(counts);
      this.totalAll.set(Object.values(counts).reduce((a, b) => a + Number(b), 0));
    } catch {
      /* counts are optional */
    }
    completeRefresh(event);
  }

  async more(event: Event): Promise<void> {
    await this.fetch(this.page() + 1);
    completeRefresh(event);
  }

  private async fetch(page: number): Promise<void> {
    try {
      const res = await this.api.get<Paginated<User>>('users', { page, search: this.search, role: this.role });
      this.items.set(page === 1 ? res.data : [...this.items(), ...res.data]);
      this.page.set(res.current_page);
      this.lastPage.set(res.last_page);
    } catch (err) {
      await this.ui.error(err);
    }
  }
}
