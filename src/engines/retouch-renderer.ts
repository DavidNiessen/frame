import { parseRetouch, type RetouchSettings, type RetouchStroke } from '../core/retouch';
export async function retouchRenderer(url: string, width: number, height: number, maximum = 4096) {
  const ratio = Math.min(
    1,
    maximum / width,
    maximum / height,
    Math.sqrt(16000000 / (width * height)),
  );
  width = Math.max(1, Math.round(width * ratio));
  height = Math.max(1, Math.round(height * ratio));
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  const bitmap = await createImageBitmap(image, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'high',
    }),
    worker = new Worker(new URL('./retouch-worker.ts', import.meta.url), { type: 'module' });
  let id = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: { bitmap?: ImageBitmap; blob?: Blob }) => void;
      reject: (error: Error) => void;
    }
  >();
  worker.onmessage = (e) => {
    const job = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (job) {
      if (e.data.error) job.reject(new Error(e.data.error));
      else job.resolve(e.data);
    } else e.data.bitmap?.close();
  };
  worker.onerror = () => {
    for (const job of pending.values())
      job.reject(new Error('Could not render the retouch layer.'));
    pending.clear();
  };
  const request = (payload: object, transfer: Transferable[] = []) =>
    new Promise<{ bitmap?: ImageBitmap; blob?: Blob }>((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      worker.postMessage({ ...payload, id }, transfer);
    });
  const close = () => {
    worker.terminate();
    for (const job of pending.values()) job.reject(new Error('Retouch cancelled.'));
    pending.clear();
  };
  try {
    await request({ bitmap }, [bitmap]);
  } catch (e) {
    close();
    throw e;
  }
  return {
    width,
    height,
    close,
    preview: async (strokes: RetouchStroke[]) => (await request({ strokes })).bitmap!,
    png: async (strokes: RetouchStroke[]) => (await request({ strokes, png: true })).blob!,
  };
}
export async function rasterRetouch(
  url: string,
  settings: RetouchSettings,
  width: number,
  height: number,
): Promise<string | null> {
  const value = parseRetouch(settings);
  if (!value.strokes.length) return null;
  const renderer = await retouchRenderer(url, width, height);
  try {
    const blob = await renderer.png(value.strokes);
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not save retouch layer.'));
      reader.readAsDataURL(blob);
    });
  } finally {
    renderer.close();
  }
}
