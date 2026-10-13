import { retouchPixels } from '../core/retouch-raster';
import type { RetouchStroke } from '../core/retouch';
let base: ImageData | undefined;
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    bitmap?: ImageBitmap;
    strokes?: RetouchStroke[];
    png?: boolean;
  }>,
) => {
  const { id, bitmap, strokes, png } = event.data;
  try {
    if (bitmap) {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
        context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      base = context.getImageData(0, 0, canvas.width, canvas.height);
      self.postMessage({ id });
      return;
    }
    if (!base || !strokes) throw new Error('Retouch source is not ready.');
    const canvas = new OffscreenCanvas(base.width, base.height),
      context = canvas.getContext('2d')!;
    context.putImageData(
      new ImageData(
        retouchPixels(base.data, base.width, base.height, strokes),
        base.width,
        base.height,
      ),
      0,
      0,
    );
    if (png) self.postMessage({ id, blob: await canvas.convertToBlob({ type: 'image/png' }) });
    else {
      const preview = canvas.transferToImageBitmap();
      self.postMessage({ id, bitmap: preview }, { transfer: [preview] });
    }
  } catch (error) {
    self.postMessage({ id, error: (error as Error).message });
  }
};
