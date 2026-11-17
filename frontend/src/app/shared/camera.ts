import { AfterViewInit, Component, ElementRef, Injectable, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { IonIcon, ModalController } from '@ionic/angular';
import { pickPhoto } from '../core/image';

type Facing = 'environment' | 'user';

/**
 * Full-screen camera inside the app: live view, shutter, and a switch between the back and front camera.
 * Dismisses with the photo (File), null when cancelled, or 'fallback' when the person picks a file instead.
 */
@Component({
  selector: 'app-camera',
  imports: [IonIcon],
  template: `
    <div class="cam">
      <video #video autoplay playsinline muted [class.mirror]="facing() === 'user'"></video>

      @if (error()) {
        <div class="cam-msg">
          <ion-icon name="camera-outline" aria-hidden="true" />
          <p>{{ error() }}</p>
          <button type="button" class="cam-alt" (click)="close('fallback')">Choose a photo instead</button>
        </div>
      } @else if (!ready()) {
        <div class="cam-msg"><p>Opening camera…</p></div>
      }

      <div class="cam-bar">
        <button type="button" class="cam-side" (click)="close(null)">Cancel</button>
        <button type="button" class="cam-shutter" [disabled]="!ready()" (click)="shoot()" aria-label="Take photo"><span></span></button>
        @if (canSwitch()) {
          <button type="button" class="cam-side cam-switch" (click)="switchCamera()"
            [attr.aria-label]="facing() === 'user' ? 'Use back camera' : 'Use front camera'">
            <ion-icon name="camera-reverse-outline" />
          </button>
        } @else {
          <span class="cam-side" aria-hidden="true"></span>
        }
      </div>
    </div>
  `,
})
export class CameraComponent implements AfterViewInit, OnDestroy {
  private modal = inject(ModalController);
  @ViewChild('video', { static: true }) private videoRef!: ElementRef<HTMLVideoElement>;

  protected facing = signal<Facing>('environment');
  protected ready = signal(false);
  protected canSwitch = signal(false);
  protected error = signal('');
  private stream: MediaStream | null = null;

  ngAfterViewInit(): void {
    void this.start();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private async start(): Promise<void> {
    this.stop();
    this.ready.set(false);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: this.facing() }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.error.set('');
      this.ready.set(true);
      // the switch button only makes sense with two or more cameras (phones; most laptops have one)
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.canSwitch.set(devices.filter((d) => d.kind === 'videoinput').length > 1);
    } catch (err) {
      const name = (err as { name?: string })?.name;
      this.error.set(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera access is blocked. Allow the camera for this app, or choose a photo instead.'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'No camera was found on this device.'
            : 'The camera could not be opened. It may be in use by another app.',
      );
    }
  }

  private stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  protected switchCamera(): void {
    this.facing.set(this.facing() === 'environment' ? 'user' : 'environment');
    void this.start();
  }

  protected shoot(): void {
    const video = this.videoRef.nativeElement;
    if (!video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => this.close(blob ? new File([blob], 'camera.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.92);
  }

  protected close(result: File | null | 'fallback'): void {
    this.stop();
    void this.modal.dismiss(result);
  }
}

/** Takes a photo with the in-app camera; falls back to the phone's own camera/file picker when that is not possible. */
@Injectable({ providedIn: 'root' })
export class CameraService {
  private modalCtrl = inject(ModalController);

  async takePhoto(): Promise<File | null> {
    // the in-app camera needs a secure page (the app, or localhost); a phone browser on http://192.168... gets the native camera
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return pickPhoto(true);

    const modal = await this.modalCtrl.create({ component: CameraComponent, cssClass: 'camera-modal' });
    await modal.present();
    const { data } = await modal.onDidDismiss<File | null | 'fallback'>();
    return data === 'fallback' ? pickPhoto(true) : (data ?? null);
  }
}
