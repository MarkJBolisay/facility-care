/**
 * Shrinks a camera photo before upload (phone photos are often 4–8 MB).
 * Returns a JPEG no larger than `maxSize` px on its longest side.
 */
export async function resizeImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file; // fall back to the original if the browser can't decode it
  }
}

/**
 * Opens the photo picker and resolves with the chosen photo (or null).
 * camera = true opens the phone camera directly (on a laptop it is the normal file picker).
 */
export function pickPhoto(camera = false): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (camera) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
