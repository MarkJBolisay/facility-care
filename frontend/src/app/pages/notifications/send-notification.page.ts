import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Paginated, ROLES, Report, User } from '../../core/models';
import { UiService } from '../../core/ui.service';
import { IONIC } from '../../shared/ionic';
import { SHARED } from '../../shared/ui';

interface SentBatch {
  batch_id: string;
  title: string;
  message: string;
  recipients: number;
  read_count: number;
  created_at: string;
  sender?: { name: string } | null;
}

const TEMPLATES = [
  { title: 'Repair scheduled', message: 'Your reported issue has been scheduled for repair. Thank you for your patience.' },
  { title: 'Repair delayed', message: 'The repair is delayed while we wait for materials. We will update you once work resumes.' },
  { title: 'Repair completed', message: 'The reported issue has been fixed. Please let us know if the problem comes back.' },
  { title: 'Facility temporarily closed', message: 'This facility is temporarily closed for maintenance. Please use the alternative room advised by your instructor.' },
];

/** Admin: send updates about repair requests and see what was sent. */
@Component({
  selector: 'app-send-notification',
  imports: [...IONIC, ...SHARED, FormsModule, DatePipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button defaultHref="/tabs/more" /></ion-buttons>
        <ion-title>Notification Management</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [(ngModel)]="view">
          <ion-segment-button value="send"><ion-label>Send update</ion-label></ion-segment-button>
          <ion-segment-button value="sent"><ion-label>Sent</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding page">
      <div class="max">
        @if (view === 'send') {
          <div class="panel">
            <ion-list lines="full">
              <ion-item>
                <ion-select label="Send to" labelPlacement="stacked" interface="popover" [(ngModel)]="target">
                  <ion-select-option value="report">People involved in a repair request</ion-select-option>
                  <ion-select-option value="role">Everyone with a role</ion-select-option>
                  <ion-select-option value="users">Specific users</ion-select-option>
                  <ion-select-option value="all">All users</ion-select-option>
                </ion-select>
              </ion-item>

              @if (target === 'report') {
                <ion-item>
                  <ion-select label="Repair request" labelPlacement="stacked" interface="action-sheet" placeholder="Choose a report" [(ngModel)]="reportId">
                    @for (r of reports(); track r.id) {
                      <ion-select-option [value]="r.id">{{ r.reference }} – {{ r.title }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
                <p class="small muted ion-padding-horizontal">Goes to the reporter and the assigned maintenance personnel.</p>
              }
              @if (target === 'role') {
                <ion-item>
                  <ion-select label="Role" labelPlacement="stacked" interface="popover" [(ngModel)]="role">
                    @for (r of roles; track r.value) {
                      <ion-select-option [value]="r.value">{{ r.label }}</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              }
              @if (target === 'users') {
                <ion-item>
                  <ion-select label="Users" labelPlacement="stacked" [multiple]="true" placeholder="Choose users" [(ngModel)]="userIds">
                    @for (u of users(); track u.id) {
                      <ion-select-option [value]="u.id">{{ u.name }} ({{ u.role }})</ion-select-option>
                    }
                  </ion-select>
                </ion-item>
              }

              <ion-item>
                <ion-input label="Title" labelPlacement="stacked" [(ngModel)]="title" maxlength="255" />
              </ion-item>
              <ion-item>
                <ion-textarea label="Message" labelPlacement="stacked" [autoGrow]="true" rows="4" [(ngModel)]="message" maxlength="2000" />
              </ion-item>
            </ion-list>

            <div class="section-title">Quick templates</div>
            <div class="pills">
              @for (t of templates; track t.title) {
                <ion-chip outline (click)="useTemplate(t)">{{ t.title }}</ion-chip>
              }
            </div>

            <ion-button expand="block" class="ion-margin-top" (click)="send()" [disabled]="sending()">
              <ion-icon slot="start" name="send-outline" /> Send notification
            </ion-button>
          </div>
        } @else {
          <ion-list class="cards">
            @for (b of sent(); track b.batch_id) {
              <ion-item>
                <ion-label class="ion-text-wrap">
                  <h3>{{ b.title }}</h3>
                  <p>{{ b.message }}</p>
                  <p class="small">
                    {{ b.created_at | date: 'MMM d, y h:mm a' }} · {{ b.recipients }} recipient(s) · {{ b.read_count }} read
                  </p>
                </ion-label>
              </ion-item>
            } @empty {
              <app-empty text="Nothing sent yet." icon="megaphone-outline" />
            }
          </ion-list>
        }
      </div>
    </ion-content>
  `,
})
export class SendNotificationPage {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  protected roles = ROLES;
  protected templates = TEMPLATES;
  protected reports = signal<Report[]>([]);
  protected users = signal<User[]>([]);
  protected sent = signal<SentBatch[]>([]);
  protected sending = signal(false);

  view: 'send' | 'sent' = 'send';
  target: 'report' | 'role' | 'users' | 'all' = 'report';
  reportId: number | null = null;
  role = 'student';
  userIds: number[] = [];
  title = '';
  message = '';

  async ionViewWillEnter(): Promise<void> {
    const qp = this.route.snapshot.queryParamMap.get('reportId');
    if (qp) {
      this.target = 'report';
      this.reportId = Number(qp);
      this.cdr.markForCheck();
    }
    try {
      const [reports, users] = await Promise.all([
        this.api.get<Paginated<Report>>('reports', { per_page: 100 }),
        this.api.get<Paginated<User>>('users', { per_page: 200 }),
      ]);
      this.reports.set(reports.data);
      this.users.set(users.data);
      await this.loadSent();
    } catch (err) {
      await this.ui.error(err);
    }
  }

  useTemplate(t: { title: string; message: string }): void {
    this.title = t.title;
    this.message = t.message;
  }

  async send(): Promise<void> {
    if (!this.title.trim() || !this.message.trim()) {
      await this.ui.toast('Enter a title and message.', 'warning');
      return;
    }
    this.sending.set(true);
    try {
      const res = await this.api.post<{ recipients: number }>('notifications/send', {
        target: this.target,
        report_id: this.reportId,
        role: this.role,
        user_ids: this.userIds,
        title: this.title,
        message: this.message,
      });
      await this.ui.toast(`Sent to ${res.recipients} user(s).`, 'success');
      this.title = '';
      this.message = '';
      this.cdr.markForCheck();
      await this.loadSent();
    } catch (err) {
      await this.ui.error(err);
    } finally {
      this.sending.set(false);
    }
  }

  private async loadSent(): Promise<void> {
    const res = await this.api.get<Paginated<SentBatch>>('notifications/sent');
    this.sent.set(res.data);
  }
}
