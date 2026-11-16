import { HttpClient } from '@angular/common/http';
import { AlertController, LoadingController } from '@ionic/angular';
import { environment } from '../../environments/environment';
import { apiBase, apiHost, canReach, hasCustomApiBase, normalizeApiBase, setApiBase } from './server';

/**
 * "Server address" dialog on the login / sign-up screens.
 * Lets the user type the laptop's IP (e.g. 192.168.100.115), checks that the
 * backend answers there, and saves it on the phone. Resolves true when the
 * address was changed.
 */
export async function openServerDialog(
  alertCtrl: AlertController,
  loadingCtrl: LoadingController,
  http: HttpClient,
): Promise<boolean> {
  const current = apiBase();
  // show just "192.168.100.115:8000" for the usual http://IP:8000/api address
  const shown = /^http:\/\/[^/]+\/api$/.test(current) ? apiHost(current) : current;

  return new Promise<boolean>((resolve) => {
    const buttons: { text: string; role?: string; handler?: (v: { address?: string }) => boolean | void }[] = [
      { text: 'Cancel', role: 'cancel', handler: () => resolve(false) },
    ];
    if (hasCustomApiBase()) {
      buttons.push({
        text: 'Use default',
        handler: () => {
          setApiBase(null);
          resolve(true);
        },
      });
    }
    buttons.push({
      text: 'Save',
      handler: (v) => {
        const url = normalizeApiBase(v?.address ?? '');
        if (!url) {
          void message(alertCtrl, 'Invalid address', 'Type the IP address of the computer running FacilityCare, for example 192.168.100.115');
          return false; // keep the dialog open
        }
        void (async () => {
          const loading = await loadingCtrl.create({ message: 'Checking server…' });
          await loading.present();
          const ok = await canReach(http, url);
          await loading.dismiss();
          setApiBase(url === environment.apiUrl ? null : url);
          resolve(true);
          await message(
            alertCtrl,
            ok ? 'Server connected' : 'Saved, but not reachable yet',
            ok
              ? `FacilityCare will use ${apiHost(url)}.`
              : `Saved ${apiHost(url)}, but the server didn't answer. Make sure the backend is running on that computer, the phone is on the same Wi-Fi, and the firewall allows port 8000.`,
          );
        })();
        return true;
      },
    });

    void alertCtrl
      .create({
        header: 'Server address',
        message: 'Type the IP address of the computer running FacilityCare (shown in its start window). The phone must be on the same Wi-Fi.',
        inputs: [
          {
            name: 'address',
            type: 'url',
            value: shown,
            placeholder: 'e.g. 192.168.100.115',
            attributes: { autocapitalize: 'off', autocorrect: 'off', inputmode: 'url' },
          },
        ],
        buttons,
        backdropDismiss: false,
      })
      .then((a) => a.present());
  });
}

async function message(alertCtrl: AlertController, header: string, text: string): Promise<void> {
  const a = await alertCtrl.create({ header, message: text, buttons: ['OK'] });
  await a.present();
}
