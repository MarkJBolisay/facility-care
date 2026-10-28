import { Component, Pipe, PipeTransform, computed, input } from '@angular/core';
import { IonBadge, IonIcon } from '@ionic/angular';
import { labelOf, toneOf } from '../core/models';

/** {{ report.status | label:'status' }} → "In Progress" */
@Pipe({ name: 'label' })
export class LabelPipe implements PipeTransform {
  transform(value: string | null | undefined, kind: string): string {
    return labelOf(kind, value);
  }
}

/** "3h ago", "2d ago", or a date for older items. */
@Pipe({ name: 'ago' })
export class AgoPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

/** Colored pill for a status or priority. */
@Component({
  selector: 'app-badge',
  imports: [IonBadge],
  template: `<ion-badge [color]="tone()" class="pill">{{ text() }}</ion-badge>`,
})
export class BadgeComponent {
  readonly kind = input.required<'status' | 'priority'>();
  readonly value = input<string | null | undefined>();
  protected tone = computed(() => toneOf(this.kind(), this.value()));
  protected text = computed(() => labelOf(this.kind(), this.value()));
}

/** Big number tile used on dashboards. */
@Component({
  selector: 'app-stat',
  imports: [IonIcon],
  template: `
    <div class="stat" [class]="'stat tone-' + color()">
      <div class="stat-top">
        <ion-icon [name]="icon()" />
        <span class="stat-label">{{ label() }}</span>
      </div>
      <div class="stat-value">{{ value() }}</div>
    </div>
  `,
})
export class StatComponent {
  readonly label = input.required<string>();
  readonly value = input<number | string | null | undefined>(0);
  readonly icon = input('ellipsis-horizontal-outline');
  readonly color = input('primary');
}

export interface BarItem {
  label: string;
  value: number;
  color?: string;
}

/** Simple horizontal bar list (no chart library needed). */
@Component({
  selector: 'app-bars',
  template: `
    @for (item of items(); track item.label) {
      <div class="bar-row">
        <div class="bar-head">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}{{ suffix() }}</strong>
        </div>
        <div class="bar-track">
          <div
            class="bar-fill"
            [style.width.%]="max() ? (item.value / max()) * 100 : 0"
            [style.background]="'var(--ion-color-' + (item.color || 'primary') + ')'"
          ></div>
        </div>
      </div>
    } @empty {
      <p class="muted small">No data for this period.</p>
    }
  `,
})
export class BarsComponent {
  readonly items = input<BarItem[]>([]);
  readonly suffix = input('');
  protected max = computed(() => Math.max(0, ...this.items().map((i) => i.value)));
}

export interface TrendPoint {
  label: string;
  submitted: number;
  completed: number;
}

/** Paired vertical bars: reports submitted vs repairs completed. */
@Component({
  selector: 'app-trend',
  template: `
    <div class="trend-legend">
      <span><i class="dot submitted"></i>Submitted</span>
      <span><i class="dot completed"></i>Completed</span>
    </div>
    <div class="trend" [class.dense]="points().length > 14">
      @for (p of points(); track $index) {
        <div class="trend-col" [title]="p.label + ': ' + p.submitted + ' submitted, ' + p.completed + ' completed'">
          <div class="trend-bars">
            <div class="trend-bar submitted" [style.height.%]="pct(p.submitted)"></div>
            <div class="trend-bar completed" [style.height.%]="pct(p.completed)"></div>
          </div>
          @if (showLabel($index)) {
            <span class="trend-label">{{ p.label }}</span>
          } @else {
            <span class="trend-label">&nbsp;</span>
          }
        </div>
      }
    </div>
  `,
})
export class TrendComponent {
  readonly points = input<TrendPoint[]>([]);
  private max = computed(() => Math.max(1, ...this.points().flatMap((p) => [p.submitted, p.completed])));

  protected pct(v: number): number {
    return (v / this.max()) * 100;
  }

  /** Thin out labels on long daily ranges so they don't overlap. */
  protected showLabel(i: number): boolean {
    const n = this.points().length;
    if (n <= 14) return true;
    const step = Math.ceil(n / 7);
    return i % step === 0;
  }
}

/** Friendly empty state. */
@Component({
  selector: 'app-empty',
  imports: [IonIcon],
  template: `
    <div class="empty">
      <ion-icon [name]="icon()" />
      <p>{{ text() }}</p>
    </div>
  `,
})
export class EmptyComponent {
  readonly text = input('Nothing here yet.');
  readonly icon = input('clipboard-outline');
}

export const SHARED = [LabelPipe, AgoPipe, BadgeComponent, StatComponent, BarsComponent, TrendComponent, EmptyComponent];

/** Finish an <ion-refresher> pull, if the call came from one. */
export function completeRefresh(event?: Event): void {
  (event?.target as { complete?: () => void } | null | undefined)?.complete?.();
}
