import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Facility, Report, WorkOrder } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';

interface History {
  facility: Facility;
  summary: {
    total_reports: number;
    open_reports: number;
    total_repairs: number;
    completed_repairs: number;
    materials_cost: number;
    last_repair: string | null;
  };
  reports: Report[];
  work_orders: WorkOrder[];
}

/** Facility record + maintenance history (previous issues and repairs). */
@Component({
  selector: 'app-facility-detail',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe, DecimalPipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="auth.isAdmin() ? '/tabs/facilities' : '/tabs/history'" /></ion-buttons>
        <ion-title>{{ data()?.facility?.name || 'Facility' }}</ion-title>
        @if (auth.isAdmin() && data()) {
          <ion-buttons slot="end">
            <ion-button [routerLink]="['/facilities', id(), 'edit']"><ion-icon slot="icon-only" name="create-outline" /></ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      @if (data(); as d) {
        <div class="max">
          <div class="panel">
            <h2 class="mt-0">{{ d.facility.name }}</h2>
            <div class="pills">
              <ion-badge color="light" class="pill">{{ d.facility.type | label: 'facilityType' }}</ion-badge>
              <app-badge kind="status" [value]="d.facility.status" />
            </div>
            <dl class="kv">
              @if (d.facility.code) {<dt>Code</dt><dd>{{ d.facility.code }}</dd>}
              @if (d.facility.parent) {
                <dt>Building</dt>
                <dd><a [routerLink]="['/facilities', d.facility.parent.id]">{{ d.facility.parent.name }}</a></dd>
              }
              @if (d.facility.floor) {<dt>Floor</dt><dd>{{ d.facility.floor }}</dd>}
              @if (d.facility.capacity) {<dt>Capacity</dt><dd>{{ d.facility.capacity }}</dd>}
              @if (d.facility.description) {<dt>Notes</dt><dd>{{ d.facility.description }}</dd>}
            </dl>
          </div>

          <div class="stat-grid">
            <app-stat label="Total issues" [value]="d.summary.total_reports" icon="document-text-outline" color="tertiary" />
            <app-stat label="Open issues" [value]="d.summary.open_reports" icon="alert-circle-outline" color="warning" />
            <app-stat label="Repairs done" [value]="d.summary.completed_repairs" icon="checkmark-circle-outline" color="success" />
            <app-stat label="Materials cost" [value]="'₱' + (d.summary.materials_cost | number: '1.0-0')" icon="pricetag-outline" color="primary" />
          </div>
          @if (d.summary.last_repair) {
            <p class="small muted">Last repair: {{ d.summary.last_repair | date: 'MMM d, y' }}</p>
          }

          @if (d.facility.children?.length) {
            <div class="section-title">
              Rooms &amp; areas ({{ d.facility.children.length }})
              @if (auth.isAdmin()) {
                <a [routerLink]="['/facilities/new']" [queryParams]="{ parent: d.facility.id }">+ Add</a>
              }
            </div>
            <ion-list class="cards">
              @for (c of d.facility.children; track c.id) {
                <ion-item button detail [routerLink]="['/facilities', c.id]">
                  <ion-label>{{ c.name }} <span class="muted small">{{ c.type | label: 'facilityType' }}</span></ion-label>
                </ion-item>
              }
            </ion-list>
          }

          <ion-segment [(ngModel)]="tab" class="ion-margin-top">
            <ion-segment-button value="repairs"><ion-label>Repairs ({{ d.work_orders.length }})</ion-label></ion-segment-button>
            <ion-segment-button value="issues"><ion-label>Issues ({{ d.reports.length }})</ion-label></ion-segment-button>
          </ion-segment>

          <ion-list class="cards ion-margin-top">
            @if (tab === 'repairs') {
              @for (w of d.work_orders; track w.id) {
                <ion-item button detail [routerLink]="['/work-orders', w.id]">
                  <ion-label>
                    <h3>{{ w.title }}</h3>
                    <p>{{ w.reference }} · {{ w.assignee?.name || 'Unassigned' }}</p>
                    @if (d.facility.type === 'building' && w.facility) {<p>{{ w.facility.name }}</p>}
                    <p>
                      {{ w.completed_at ? 'Completed ' + (w.completed_at | date: 'MMM d, y') : 'Created ' + (w.created_at | date: 'MMM d, y') }}
                      @if (w.materials_cost) { · ₱{{ w.materials_cost | number: '1.0-0' }} }
                    </p>
                    @if (w.actions_taken) {<p class="muted">{{ w.actions_taken }}</p>}
                    <div class="pills"><app-badge kind="status" [value]="w.status" /><app-badge kind="priority" [value]="w.priority" /></div>
                  </ion-label>
                </ion-item>
              } @empty {
                <app-empty text="No repairs recorded for this facility." icon="hammer-outline" />
              }
            } @else {
              @for (r of d.reports; track r.id) {
                <ion-item button detail [routerLink]="['/reports', r.id]" [disabled]="!auth.isAdmin()">
                  <ion-label>
                    <h3>{{ r.title }}</h3>
                    <p>{{ r.reference }} · {{ r.created_at | date: 'MMM d, y' }} · {{ r.reporter?.name }}</p>
                    @if (d.facility.type === 'building' && r.facility) {<p>{{ r.facility.name }}</p>}
                    <div class="pills"><app-badge kind="status" [value]="r.status" /><ion-badge color="light" class="pill">{{ r.category | label: 'category' }}</ion-badge></div>
                  </ion-label>
                </ion-item>
              } @empty {
                <app-empty text="No issues reported for this facility." />
              }
            }
          </ion-list>
        </div>
      } @else {
        <div class="ion-text-center ion-padding"><ion-spinner /></div>
      }
    </ion-content>
  `,
})
export class FacilityDetailPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  protected auth = inject(AuthService);

  readonly id = input.required<string>();
  protected data = signal<History | null>(null);
  tab: 'repairs' | 'issues' = 'repairs';

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.data.set(await this.api.get<History>(`facilities/${this.id()}/history`));
    } catch (err) {
      await this.ui.error(err);
    }
  }
}
