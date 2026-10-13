import { portableImageKind, MAX_PORTABLE_IMAGE_BYTES } from '../core/image-decoders';
import type { ImageSourceMetadata } from '../core/image-metadata';
export async function browserImageSource(
  file: File,
  signal?: AbortSignal,
): Promise<{ file: File; metadata?: ImageSourceMetadata }> {
  const kind = portableImageKind(file.name);
  if (!kind) return { file };
  if (file.size > MAX_PORTABLE_IMAGE_BYTES)
    throw new Error('HEIC and RAW images are limited to 128 MB per file.');
  signal?.throwIfAborted();
  const worker = new Worker(new URL('./image-decode-worker.ts', import.meta.url), {
      type: 'module',
    }),
    bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const result = await new Promise<{ bytes: Uint8Array; metadata: ImageSourceMetadata }>(
      (resolve, reject) => {
        const abort = () => reject(new Error('Image import cancelled.'));
        signal?.addEventListener('abort', abort, { once: true });
        worker.onmessage = (e) => {
          signal?.removeEventListener('abort', abort);
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.result);
        };
        worker.onerror = () => {
          signal?.removeEventListener('abort', abort);
          reject(new Error('Could not decode this HEIC or RAW image.'));
        };
        worker.postMessage(
          { bytes, kind, base: new URL('image-decoders/', document.baseURI).href },
          [bytes.buffer],
        );
      },
    );
    signal?.throwIfAborted();
    return {
      file: new File([new Uint8Array(result.bytes)], 'working.png', { type: 'image/png' }),
      metadata: result.metadata,
    };
  } finally {
    worker.terminate();
  }
}
