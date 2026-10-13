import { parseCutout, type CutoutSettings } from '../core/cutout';
export async function rasterCutout(
  url: string,
  settings: CutoutSettings,
  width: number,
  height: number,
  signal?: AbortSignal,
) {
  const value = parseCutout(settings),
    ratio = Math.min(1, 4096 / width, 4096 / height, Math.sqrt(16000000 / (width * height))),
    image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(image, {
      resizeWidth: Math.max(1, Math.round(width * ratio)),
      resizeHeight: Math.max(1, Math.round(height * ratio)),
      resizeQuality: 'high',
    }),
    worker = new Worker(new URL('./cutout-worker.ts', import.meta.url), { type: 'module' });
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const abort = () => reject(new Error('Background removal cancelled.'));
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = (e) => {
        signal?.removeEventListener('abort', abort);
        if (e.data.error) reject(new Error(e.data.error));
        else resolve(e.data.blob);
      };
      worker.onerror = () => {
        signal?.removeEventListener('abort', abort);
        reject(new Error('Could not remove the background.'));
      };
      worker.postMessage({ bitmap, settings: value }, [bitmap]);
    });
    signal?.throwIfAborted();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not save the background mask.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    worker.terminate();
  }
}
