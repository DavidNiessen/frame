import { drawStroke, type PaintStroke } from '../core/painting';
export async function rasterPainting(
  strokes: PaintStroke[],
  width: number,
  height: number,
): Promise<string | null> {
  if (!strokes.length) return null;
  const ratio = Math.min(1, 4096 / width, 4096 / height, Math.sqrt(16000000 / (width * height)));
  width = Math.max(1, Math.round(width * ratio));
  height = Math.max(1, Math.round(height * ratio));
  let blob: Blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const worker = new Worker(new URL('./painting-worker.ts', import.meta.url), { type: 'module' });
    try {
      blob = await new Promise<Blob>((resolve, reject) => {
        worker.onmessage = (e) =>
          e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.blob);
        worker.onerror = () => reject(new Error('Could not render painting.'));
        worker.postMessage({ strokes, width, height });
      });
    } finally {
      worker.terminate();
    }
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    for (const stroke of strokes) drawStroke(context, stroke, width, height);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Could not render painting.'))),
        'image/png',
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not save paint layer.'));
    reader.readAsDataURL(blob);
  });
}
