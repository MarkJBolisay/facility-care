import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { labelOf, toneOf } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { BarItem, SHARED, TrendPoint } from '../../shared/ui';

interface Analytics {
  period: string;
  label: string;
  from: string;
  to: string;
  summary: {
    total_reports: number;
    pending: number;
    approved: number;
    in_progress: number;
    completed: number;
    rejected: number;
    completion_rate: number;
    work_orders_created: number;
    repairs_completed: number;
    avg_resolution_hours: number | null;
    materials_cost: number;
  };
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
  by_facility: { name: string; total: number }[];
  by_personnel: { name: string; completed: number; avg_hours: number }[];
  materials: { name: string; type: string; unit: string | null; quantity: number; cost: number }[];
  trend: TrendPoint[];
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Component({
  selector: 'app-analytics',
  imports: [...IONIC, ...SHARED, FormsModule, DecimalPipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        <ion-title>Reports &amp; Analytics</ion-title>
        @if (data()) {
          <ion-buttons slot="end">
            <ion-button (click)="exportCsv()"><ion-icon slot="icon-only" name="download-outline" /></ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [(ngModel)]="period" (ionChange)="generate()">
          <ion-segment-button value="monthly"><ion-label>Monthly</ion-label></ion-segment-button>
          <ion-segment-button value="quarterly"><ion-label>Quarterly</ion-label></ion-segment-button>
          <ion-segment-button value="yearly"><ion-label>Yearly</ion-label></ion-segment-button>
          <ion-segment-button value="custom"><ion-label>Custom</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      <div class="max">
        <div class="panel">
          <ion-row>
            @if (period === 'custom') {
              <ion-col size="6"><ion-input label="From" labelPlacement="stacked" type="date" [(ngModel)]="from" /></ion-col>
              <ion-col size="6"><ion-input label="To" labelPlacement="stacked" type="date" [(ngModel)]="to" /></ion-col>
            } @else {
              <ion-col [size]="period === 'yearly' ? '12' : '6'">
                <ion-select label="Year" labelPlacement="stacked" interface="popover" [(ngModel)]="year" (ionChange)="generate()">
                  @for (y of years; track y) {
                    <ion-select-option [value]="y">{{ y }}</ion-select-option>
                  }
                </ion-select>
              </ion-col>
              @if (period === 'monthly') {
                <ion-col size="6">
                  <ion-select label="Month" labelPlacement="stacked" interface="action-sheet" [(ngModel)]="month" (ionChange)="generate()">
                    @for (m of months; track $index) {
                      <ion-select-option [value]="$index + 1">{{ m }}</ion-select-option>
                    }
                  </ion-select>
                </ion-col>
              }
              @if (period === 'quarterly') {
                <ion-col size="6">
                  <ion-select label="Quarter" labelPlacement="stacked" interface="popover" [(ngModel)]="quarter" (ionChange)="generate()">
                    <ion-select-option [value]="1">Q1 (Jan–Mar)</ion-select-option>
                    <ion-select-option [value]="2">Q2 (Apr–Jun)</ion-select-option>
                    <ion-select-option [value]="3">Q3 (Jul–Sep)</ion-select-option>
                    <ion-select-option [value]="4">Q4 (Oct–Dec)</ion-select-option>
                  </ion-select>
                </ion-col>
              }
            }
          </ion-row>
          @if (period === 'custom') {
            <ion-button expand="block" (click)="generate()">Generate report</ion-button>
          }
        </div>

        @if (loading()) {
          <ion-progress-bar type="indeterminate" />
        }

        @if (data(); as d) {
          <h2>{{ d.label }}</h2>
          <p class="muted small mt-0">{{ d.from }} to {{ d.to }}</p>

          <div class="stat-grid">
            <app-stat label="Reports received" [value]="d.summary.total_reports" icon="document-text-outline" color="tertiary" />
            <app-stat label="Repairs completed" [value]="d.summary.repairs_completed" icon="checkmark-circle-outline" color="success" />
            <app-stat label="Completion rate" [value]="d.summary.completion_rate + '%'" icon="analytics-outline" color="primary" />
            <app-stat label="Avg. resolution" [value]="resolution()" icon="time-outline" color="warning" />
          </div>

          <div class="section-title">Status of reports received</div>
          <div class="panel"><app-bars [items]="statusBars()" /></div>

          <div class="section-title">Submitted vs completed</div>
          <div class="panel"><app-trend [points]="d.trend" /></div>

          <div class="section-title">By category</div>
          <div class="panel"><app-bars [items]="categoryBars()" /></div>

          <div class="section-title">By priority</div>
          <div class="panel"><app-bars [items]="priorityBars()" /></div>

          <div class="section-title">Most reported facilities</div>
          <div class="panel"><app-bars [items]="facilityBars()" /></div>

          <div class="section-title">Personnel performance</div>
          <ion-list class="cards">
            @for (p of d.by_personnel; track p.name) {
              <ion-item>
                <ion-icon slot="start" name="person-outline" />
                <ion-label>
                  <h3>{{ p.name }}</h3>
                  <p>Avg. {{ p.avg_hours }}h from start to finish</p>
                </ion-label>
                <ion-badge slot="end" color="success">{{ p.completed }} done</ion-badge>
              </ion-item>
            } @empty {
              <p class="muted small">No completed repairs in this period.</p>
            }
          </ion-list>

          <div class="section-title">
            Materials &amp; equipment
            <span>₱{{ d.summary.materials_cost | number: '1.2-2' }}</span>
          </div>
          <ion-list class="cards">
            @for (m of d.materials; track m.name) {
              <ion-item>
                <ion-label>
                  <h3>{{ m.name }}</h3>
                  <p>{{ m.quantity }} {{ m.unit }} · {{ m.type }}</p>
                </ion-label>
                <ion-note slot="end">₱{{ m.cost | number: '1.2-2' }}</ion-note>
              </ion-item>
            } @empty {
              <p class="muted small">No materials recorded.</p>
            }
          </ion-list>

          <ion-button expand="block" fill="outline" (click)="exportCsv()">
            <ion-icon slot="start" name="download-outline" /> Export as CSV (Excel)
          </ion-button>
        }
      </div>
    </ion-content>
  `,
})
export class AnalyticsPage {
  private api = inject(ApiService);
  private ui = inject(UiService);

  protected months = MONTHS;
  protected years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  period: 'monthly' | 'quarterly' | 'yearly' | 'custom' = 'monthly';
  year = new Date().getFullYear();
  month = new Date().getMonth() + 1;
  quarter = Math.floor(new Date().getMonth() / 3) + 1;
  from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  to = new Date().toISOString().slice(0, 10);

  protected data = signal<Analytics | null>(null);
  protected loading = signal(false);

  protected resolution = computed(() => {
    const h = this.data()?.summary.avg_resolution_hours;
    if (h === null || h === undefined) return '—';
    return h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h} hrs`;
  });

  protected statusBars = computed<BarItem[]>(() => {
    const s = this.data()?.summary;
    if (!s) return [];
    return (['pending', 'approved', 'in_progress', 'completed', 'rejected'] as const).map((k) => ({
      label: labelOf('status', k),
      value: s[k],
      color: toneOf('status', k),
    }));
  });

  protected categoryBars = computed<BarItem[]>(() =>
    Object.entries(this.data()?.by_category ?? {}).map(([k, v]) => ({ label: labelOf('category', k === 'unset' ? null : k), value: v })),
  );

  protected priorityBars = computed<BarItem[]>(() =>
    Object.entries(this.data()?.by_priority ?? {}).map(([k, v]) => ({
      label: labelOf('priority', k === 'unset' ? null : k),
      value: v,
      color: toneOf('priority', k),
    })),
  );

  protected facilityBars = computed<BarItem[]>(() =>
    (this.data()?.by_facility ?? []).map((f) => ({ label: f.name, value: f.total, color: 'tertiary' })),
  );

  ionViewWillEnter(): void {
    if (!this.data()) void this.generate();
  }

  async generate(): Promise<void> {
    if (this.period === 'custom' && (!this.from || !this.to)) return;
    this.loading.set(true);
    try {
      this.data.set(
        await this.api.get<Analytics>('analytics', {
          period: this.period,
          year: this.year,
          month: this.month,
          quarter: this.quarter,
          from: this.period === 'custom' ? this.from : null,
          to: this.period === 'custom' ? this.to : null,
        }),
      );
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  async exportCsv(): Promise<void> {
    const d = this.data();
    if (!d) return;
    const rows: (string | number)[][] = [
      ['FacilityCare Report', d.label],
      ['Period', `${d.from} to ${d.to}`],
      [],
      ['Summary'],
      ['Reports received', d.summary.total_reports],
      ['Pending', d.summary.pending],
      ['Approved', d.summary.approved],
      ['In progress', d.summary.in_progress],
      ['Completed', d.summary.completed],
      ['Rejected', d.summary.rejected],
      ['Completion rate (%)', d.summary.completion_rate],
      ['Work orders created', d.summary.work_orders_created],
      ['Repairs completed', d.summary.repairs_completed],
      ['Average resolution (hours)', d.summary.avg_resolution_hours ?? ''],
      ['Materials cost (PHP)', d.summary.materials_cost],
      [],
      ['By category', 'Reports'],
      ...Object.entries(d.by_category).map(([k, v]) => [labelOf('category', k === 'unset' ? null : k), v]),
      [],
      ['By priority', 'Reports'],
      ...Object.entries(d.by_priority).map(([k, v]) => [labelOf('priority', k === 'unset' ? null : k), v]),
      [],
      ['Facility', 'Reports'],
      ...d.by_facility.map((f) => [f.name, f.total]),
      [],
      ['Personnel', 'Completed', 'Avg hours'],
      ...d.by_personnel.map((p) => [p.name, p.completed, p.avg_hours]),
      [],
      ['Material / equipment', 'Type', 'Quantity', 'Unit', 'Cost (PHP)'],
      ...d.materials.map((m) => [m.name, m.type, m.quantity, m.unit ?? '', m.cost]),
      [],
      ['Date', 'Submitted', 'Completed'],
      ...d.trend.map((t) => [t.label, t.submitted, t.completed]),
    ];
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const fileName = `facilitycare-${d.period}-${d.from}-to-${d.to}.csv`;
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });

    // On phones, use the share sheet (save to Files, Drive, email…); otherwise download.
    const file = new File([blob], fileName, { type: 'text/csv' });
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return;
      } catch {
        /* fall back to download */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await this.ui.toast('CSV exported.', 'success');
  }
}

function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
