import { Injectable, inject } from '@angular/core';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import { errorMessage } from './api.service';

@Injectable({ providedIn: 'root' })
export class UiService {
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);

  async toast(message: string, color: 'success' | 'danger' | 'dark' | 'warning' = 'dark'): Promise<void> {
    const t = await this.toastCtrl.create({ message, color, duration: 2500, position: 'bottom' });
    await t.present();
  }

  async error(err: unknown): Promise<void> {
    await this.toast(errorMessage(err), 'danger');
  }

  async confirm(header: string, message: string, okText = 'Yes', destructive = false): Promise<boolean> {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: okText, role: 'confirm', cssClass: destructive ? 'alert-danger' : '' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /** Ask for a line of text. Resolves null when cancelled. */
  async prompt(header: string, placeholder: string, okText = 'Submit', required = true): Promise<string | null> {
    const alert = await this.alertCtrl.create({
      header,
      inputs: [{ name: 'value', type: 'textarea', placeholder }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: okText,
          role: 'confirm',
          handler: (data: { value: string }) => !required || !!data.value?.trim(),
        },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss<{ values: { value: string } }>();
    return role === 'confirm' ? (data?.values.value ?? '').trim() : null;
  }

  /** Run an async action behind a spinner; shows any error as a toast. Returns undefined on failure. */
  async busy<T>(action: () => Promise<T>, message = 'Please wait…'): Promise<T | undefined> {
    const loading = await this.loadingCtrl.create({ message });
    await loading.present();
    try {
      return await action();
    } catch (err) {
      await this.error(err);
      return undefined;
    } finally {
      await loading.dismiss();
    }
  }
}
