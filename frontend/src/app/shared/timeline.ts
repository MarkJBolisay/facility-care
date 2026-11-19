import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { REPAIR_STAGES, STAGE_ORDER, WorkOrder } from '../core/models';

export interface TimelineItem {
  key: string;
  label: string;
  icon: string;
  at: string | null;
  remarks: string | null;
  person: string | null;
  photos: { id: number; url: string }[];
  state: 'done' | 'current' | 'upcoming';
}

/**
 * The five-stage repair timeline: green when finished, highlighted for the
 * current stage, grey for stages that have not happened yet.
 */
@Component({
  selector: 'app-repair-timeline',
  imports: [IonIcon, DatePipe],
  template: `
    <ol class="tl">
      @for (item of items(); track item.key) {
        <li class="tl-item" [class.done]="item.state === 'done'" [class.now]="item.state === 'current'" [class.upcoming]="item.state === 'upcoming'">
          <span class="tl-icon"><ion-icon [name]="item.icon" /></span>
          <div class="tl-body">
            <div class="tl-head">
              <strong>{{ item.label }}</strong>
              @if (item.at) {
                <span class="tl-time">{{ item.at | date: 'MMM d, y · h:mm a' }}</span>
              } @else {
                <span class="tl-time">Waiting</span>
              }
            </div>
            @if (item.remarks) {
              <p class="tl-remarks">{{ item.remarks }}</p>
            }
            @if (item.person) {
              <p class="tl-person"><ion-icon name="person-outline" /> {{ item.person }}</p>
            }
            @if (item.photos.length) {
              <div class="tl-photos">
                @for (p of item.photos; track p.id) {
                  <a [href]="p.url" target="_blank" rel="noopener">
                    <img [src]="p.url" alt="Proof photo for {{ item.label }}" loading="lazy" />
                  </a>
                }
              </div>
            }
          </div>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      .tl { list-style: none; margin: 0; padding: 0 0 0 6px; }
      .tl-item { position: relative; display: flex; gap: 14px; padding: 0 0 22px 0; }
      .tl-item::before {
        content: ''; position: absolute; left: 17px; top: 34px; bottom: 0; width: 2px; background: var(--fc-line, #e3e9f2);
      }
      .tl-item:last-child::before { display: none; }
      .tl-icon {
        position: relative; z-index: 1; display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px;
        border-radius: 50%; background: var(--fc-page, #f5f8fd); color: var(--fc-muted, #7a8394);
        border: 2px solid var(--fc-line, #e3e9f2); font-size: 18px;
      }
      .tl-body { min-width: 0; flex: 1; padding-top: 2px; }
      .tl-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .tl-head strong { font-size: 0.98rem; }
      .tl-time { font-size: 0.75rem; color: var(--fc-muted, #7a8394); }
      .tl-remarks { margin: 4px 0 0; font-size: 0.86rem; color: var(--fc-text, #5b6475); white-space: pre-wrap; }
      .tl-person { display: flex; align-items: center; gap: 4px; margin: 4px 0 0; font-size: 0.78rem; color: var(--fc-muted, #7a8394); }
      .tl-photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .tl-photos a { display: block; }
      .tl-photos img {
        width: 74px; height: 74px; object-fit: cover; border-radius: 12px; border: 1px solid var(--fc-line, #e3e9f2);
      }
      .tl-item.done .tl-icon { background: var(--ion-color-success, #16a34a); border-color: var(--ion-color-success, #16a34a); color: #fff; }
      .tl-item.done::before { background: var(--ion-color-success, #16a34a); }
      .tl-item.now .tl-icon {
        background: var(--ion-color-primary, #2160e0); border-color: var(--ion-color-primary, #2160e0); color: #fff;
        box-shadow: 0 0 0 4px rgba(var(--ion-color-primary-rgb, 33, 96, 224), 0.18);
      }
      .tl-item.now .tl-head strong { color: var(--ion-color-primary, #2160e0); }
      .tl-item.upcoming { opacity: 0.62; }
    `,
  ],
})
export class RepairTimelineComponent {
  readonly items = input<TimelineItem[]>([]);
}

/**
 * Turn a work order into the five timeline rows. Each stage uses its own photo
 * proof; the report photo stands in for the "Reported" stage.
 */
export function buildWorkOrderTimeline(wo: WorkOrder): TimelineItem[] {
  const current = STAGE_ORDER[wo.status] ?? -1;
  const cancelled = wo.status === 'cancelled';
  const stageRow = (key: string) => wo.stages?.find((s) => s.stage === key) ?? null;

  return REPAIR_STAGES.map((stage, index) => {
    const row = stageRow(stage.value);
    let at: string | null = row?.created_at ?? null;
    let remarks = row?.remarks ?? null;
    let person = row?.user?.name ?? null;

    if (stage.value === 'reported') {
      at = at ?? wo.report?.created_at ?? wo.created_at;
      person = person ?? wo.report?.reporter?.name ?? wo.creator?.name ?? null;
      remarks = remarks ?? (wo.report ? `Request ${wo.report.reference} submitted.` : 'Work order created.');
    }
    if (stage.value === 'pending') {
      at = at ?? wo.created_at;
      person = person ?? wo.creator?.name ?? null;
    }
    if (stage.value === 'in_progress') {
      at = at ?? wo.started_at;
      person = person ?? wo.assignee?.name ?? null;
    }
    if (stage.value === 'nearing_completion') {
      at = at ?? wo.nearing_completion_at;
      remarks = remarks ?? (at ? wo.actions_taken : null);
      person = person ?? wo.assignee?.name ?? null;
    }
    if (stage.value === 'completed') {
      at = at ?? wo.completed_at;
      remarks = remarks ?? (at ? wo.remarks || wo.actions_taken : null);
      person = person ?? wo.completer?.name ?? wo.assignee?.name ?? null;
    }

    let photos = (wo.photos ?? [])
      .filter((p) => p.stage === stage.value)
      .map((p) => ({ id: p.id, url: p.url }));

    if (!photos.length && stage.value === 'reported' && wo.report?.photo_url) {
      photos = [{ id: -1, url: wo.report.photo_url }];
    }
    if (!photos.length && stage.value === 'in_progress') {
      photos = (wo.photos ?? []).filter((p) => p.type === 'before' && !p.stage).map((p) => ({ id: p.id, url: p.url }));
    }

    const state: TimelineItem['state'] = cancelled
      ? index <= current ? 'done' : 'upcoming'
      : index < current || wo.status === 'completed'
        ? 'done'
        : index === current
          ? 'current'
          : 'upcoming';

    return { key: stage.value, label: stage.label, icon: stage.icon, at, remarks, person, photos, state };
  });
}
