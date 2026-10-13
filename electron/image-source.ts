import { app } from 'electron';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAX_PORTABLE_IMAGE_BYTES, portableImageKind } from '../src/core/image-decoders';
import type { ImageSourceMetadata } from '../src/core/image-metadata';
let tail = Promise.resolve();
/** Decode large originals one at a time, outside Electron's main thread. */
export function prepareImageSource(
  input: string,
  signal?: AbortSignal,
): Promise<{ path: string; directory?: string; metadata?: ImageSourceMetadata }> {
  const kind = portableImageKind(input);
  if (!kind) return Promise.resolve({ path: input });
  const task = tail.then(async () => {
    signal?.throwIfAborted();
    if ((await stat(input)).size > MAX_PORTABLE_IMAGE_BYTES)
      throw new Error('HEIC and RAW images are limited to 128 MB per file.');
    const directory = await mkdtemp(join(tmpdir(), 'frame-decoded-image-')),
      path = join(directory, 'working.png'),
      root = join(
        app.isPackaged ? process.resourcesPath : join(__dirname, '../public'),
        'image-decoders',
      );
    let worker: Worker | undefined;
    try {
      const metadata = await new Promise<ImageSourceMetadata>((resolve, reject) => {
        worker = new Worker(join(__dirname, 'image-decode-worker.cjs'), {
          workerData: { input, output: path, kind, root },
        });
        const abort = () => reject(new Error('Image import cancelled.')),
          timer = setTimeout(() => reject(new Error('Decoding this image timed out.')), 120000),
          cleanup = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
          };
        signal?.addEventListener('abort', abort, { once: true });
        worker.once('message', (result) => {
          cleanup();
          if (result.error) reject(new Error(result.error));
          else resolve(result.metadata);
        });
        worker.once('error', (error) => {
          cleanup();
          reject(error);
        });
        worker.once('exit', (code) => {
          cleanup();
          reject(new Error(`The image decoder stopped unexpectedly (${code}).`));
        });
      });
      signal?.throwIfAborted();
      return { path, directory, metadata };
    } catch (error) {
      await worker?.terminate();
      await rm(directory, { recursive: true, force: true });
      throw error;
    } finally {
      await worker?.terminate();
    }
  });
  tail = task.then(
    () => {},
    () => {},
  );
  return task;
}
