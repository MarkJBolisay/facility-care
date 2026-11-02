import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Equipment, WorkOrder, equipmentIcon } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED, completeRefresh } from '../../shared/ui';

interface Schedule {
  overdue: Equipment[];
  due_soon: Equipment[];
  scheduled: Equipment[];
}

/** Preventive maintenance: upcoming and overdue servicing, with one-tap scheduling. */
@Component({
  selector: 'app-preventive',
  imports: [...IONIC, ...SHARED, FormsModule, RouterLink, DatePipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        <ion-title>Preventive Maintenance</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [(ngModel)]="tab">
          <ion-segment-button value="overdue"><ion-label>Overdue ({{ data()?.overdue?.length ?? 0 }})</ion-label></ion-segment-button>
          <ion-segment-button value="due_soon"><ion-label>Due soon ({{ data()?.due_soon?.length ?? 0 }})</ion-label></ion-segment-button>
          <ion-segment-button value="scheduled"><ion-label>Later ({{ data()?.scheduled?.length ?? 0 }})</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      <ion-refresher slot="fixed" (ionRefresh)="load($event)"><ion-refresher-content /></ion-refresher>
      <div class="max">
        <p class="small muted mt-0">
          Next service = last service + interval. "Due soon" means within 14 days. Admins get a reminder when items are due.
        </p>
        @if (data(); as d) {
          <ion-list class="cards">
            @for (e of d[tab]; track e.id) {
              <ion-item>
                <div slot="start" class="eq-icon" [class]="'eq-icon tint-' + (tab === 'overdue' ? 'danger' : tab === 'due_soon' ? 'warning' : 'success')">
                  <ion-icon [name]="icon(e.category)" />
                </div>
                <ion-label class="ion-text-wrap">
                  <h3><a [routerLink]="['/equipment', e.id]">{{ e.name }}</a></h3>
                  <p>{{ e.code }} · {{ e.facility?.full_name || 'No location' }}</p>
                  <p>
                    <strong [class.text-danger]="tab === 'overdue'">Due {{ e.next_maintenance_due | date: 'MMM d, y' }}</strong>
                    · every {{ e.maintenance_interval_days }} days
                    · last {{ e.last_maintained_at ? (e.last_maintained_at | date: 'MMM d') : 'never' }}
                  </p>
                  @if (e.open_work_order; as wo) {
                    <p>
                      <ion-icon name="checkmark-circle-outline" color="success" />
                      Scheduled as <a [routerLink]="['/work-orders', wo.id]">{{ wo.reference }}</a>
                      · {{ wo.assignee?.name || 'unassigned' }}
                    </p>
                  }
                </ion-label>
                @if (!e.open_work_order) {
                  <ion-button slot="end" size="small" [disabled]="busyId() === e.id" (click)="schedule(e)">
                    {{ busyId() === e.id ? '…' : 'Schedule' }}
                  </ion-button>
                }
              </ion-item>
            } @empty {
              <app-empty [text]="tab === 'overdue' ? 'Nothing is overdue.' : tab === 'due_soon' ? 'Nothing is due in the next 14 days.' : 'No other scheduled equipment.'" icon="calendar-outline" />
            }
          </ion-list>
        } @else {
          <div class="ion-text-center ion-padding"><ion-spinner /></div>
        }
      </div>
    </ion-content>
  `,
})
export class PreventivePage {
  private api = inject(ApiService);
  private ui = inject(UiService);

  protected data = signal<Schedule | null>(null);
  protected busyId = signal<number | null>(null);
  tab: keyof Schedule = 'overdue';
  protected icon = equipmentIcon;

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(event?: Event): Promise<void> {
    try {
      const d = await this.api.get<Schedule>('preventive-maintenance');
      this.data.set(d);
      if (!d.overdue.length && this.tab === 'overdue' && d.due_soon.length) this.tab = 'due_soon';
    } catch (err) {
      await this.ui.error(err);
    } finally {
      completeRefresh(event);
    }
  }

  /** Create the preventive work order; the recommended technician is assigned automatically. */
  async schedule(e: Equipment): Promise<void> {
    this.busyId.set(e.id);
    try {
      const wo = await this.api.post<WorkOrder>(`equipment/${e.id}/schedule`, {});
      await this.ui.toast(`${wo.reference} scheduled${wo.assignee ? ' — assigned to ' + wo.assignee.name : ''}.`, 'success');
      await this.load();
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.busyId.set(null);
    }
  }
}
