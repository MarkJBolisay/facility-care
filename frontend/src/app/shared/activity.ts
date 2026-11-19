import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { ActivityLog, labelOf } from '../core/models';

const ICONS: Record<string, { icon: string; tone: string }> = {
  submitted: { icon: 'document-text-outline', tone: 'primary' },
  approved: { icon: 'checkmark-circle-outline', tone: 'success' },
  rejected: { icon: 'close-circle-outline', tone: 'danger' },
  work_order_created: { icon: 'hammer-outline', tone: 'primary' },
  scheduled: { icon: 'calendar-outline', tone: 'tertiary' },
  assigned: { icon: 'person-add-outline', tone: 'tertiary' },
  status_changed: { icon: 'construct-outline', tone: 'primary' },
  completed: { icon: 'checkmark-done-outline', tone: 'success' },
  confirmed: { icon: 'checkmark-done-outline', tone: 'success' },
  reopened: { icon: 'refresh-outline', tone: 'danger' },
  condition_changed: { icon: 'pulse-outline', tone: 'warning' },
  priority_changed: { icon: 'flag-outline', tone: 'warning' },
  category_changed: { icon: 'pricetag-outline', tone: 'medium' },
  due_date_changed: { icon: 'calendar-outline', tone: 'medium' },
  material_added: { icon: 'cube-outline', tone: 'primary' },
  material_updated: { icon: 'create-outline', tone: 'medium' },
  material_removed: { icon: 'trash-outline', tone: 'danger' },
  no_materials: { icon: 'cube-outline', tone: 'medium' },
  equipment_added: { icon: 'add-circle-outline', tone: 'success' },
  equipment_updated: { icon: 'create-outline', tone: 'medium' },
  availability_changed: { icon: 'person-outline', tone: 'medium' },
};

/**
 * Activity history: what happened, who did it and when.
 * With showLinks, each entry also links to its request / work order / equipment (used on the activity log page).
 */
@Component({
  selector: 'app-activity',
  imports: [IonIcon, DatePipe, RouterLink],
  template: `
    <ol class="act">
      @for (a of items(); track a.id) {
        <li>
          <span class="act-dot" [class]="'act-dot tint-' + look(a).tone"><ion-icon [name]="look(a).icon" /></span>
          <div class="act-main">
            <p class="act-text">{{ a.description }}</p>
            <p class="act-meta">
              {{ a.created_at | date: 'MMM d, y · h:mm a' }}
              @if (a.user) { · {{ a.user.name }} <span class="act-role">({{ roleOf(a.user.role) }})</span> }
            </p>
            @if (showLinks()) {
              <p class="act-links">
                @if (a.report) { <a [routerLink]="['/reports', a.report.id]">{{ a.report.reference }}</a> }
                @if (a.work_order) { <a [routerLink]="['/work-orders', a.work_order.id]">{{ a.work_order.reference }}</a> }
                @if (a.equipment) { <a [routerLink]="['/equipment', a.equipment.id]">{{ a.equipment.code }} {{ a.equipment.name }}</a> }
              </p>
            }
          </div>
        </li>
      } @empty {
        <li class="act-empty">No activity yet.</li>
      }
    </ol>
  `,
})
export class ActivityComponent {
  readonly items = input<ActivityLog[]>([]);
  readonly showLinks = input(false);

  protected look(a: ActivityLog) {
    return ICONS[a.action] ?? { icon: 'ellipse-outline', tone: 'medium' };
  }

  protected roleOf(role: string): string {
    return labelOf('role', role);
  }
}
