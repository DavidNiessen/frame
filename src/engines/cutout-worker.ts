import { cutoutPixels } from '../core/cutout-raster';
import type { CutoutSettings } from '../core/cutout';
self.onmessage = async (event: MessageEvent<{ bitmap: ImageBitmap; settings: CutoutSettings }>) => {
  try {
    const { bitmap, settings } = event.data,
      canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
      context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const base = context.getImageData(0, 0, canvas.width, canvas.height);
    context.putImageData(
      new ImageData(
        cutoutPixels(base.data, base.width, base.height, settings),
        base.width,
        base.height,
      ),
      0,
      0,
    );
    self.postMessage({ blob: await canvas.convertToBlob({ type: 'image/png' }) });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
