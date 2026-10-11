import { bytes } from '../core/format';
import { mediaUrl, remoteFilename } from '../core/remote-media';
import type { ExportProgress } from '../core/types';

export interface RemoteDownloadOptions {
  signal: AbortSignal;
  maxBytes?: number;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  onOpen?: (file: { name: string; type: string }) => Promise<void>;
  onChunk: (chunk: Uint8Array) => Promise<void>;
  onProgress?: (progress: ExportProgress) => void;
}
export async function downloadRemoteMedia(input: string, options: RemoteDownloadOptions) {
  const url = mediaUrl(input),
    controller = new AbortController();
  const cancel = () => controller.abort(new Error('URL import cancelled.'));
  options.signal.addEventListener('abort', cancel, { once: true });
  if (options.signal.aborted) cancel();
  let timeout: ReturnType<typeof setTimeout>;
  const resetTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(
      () => controller.abort(new Error('The server stopped responding. Try the link again.')),
      30000,
    );
  };
  resetTimeout();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined;
  const maximum = options.maxBytes ?? Infinity;
  const tooLarge = () =>
    new Error(
      `This download exceeds the available browser limit (${bytes(maximum)}). Remove files or use desktop for larger media.`,
    );
  try {
    options.onProgress?.({ ratio: 0, message: 'Connecting to the media host…' });
    response = await (options.fetcher || fetch)(url.href, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
    });
    resetTimeout();
    if (!response.ok)
      throw new Error(`Download failed (HTTP ${response.status}). Check the direct file link.`);
    const file = remoteFilename(mediaUrl(response.url || url.href), response.headers);
    const total = Number(response.headers.get('content-length')) || 0;
    if (total > maximum) throw tooLarge();
    if (!response.body) throw new Error('The server returned no media data.');
    await options.onOpen?.(file);
    reader = response.body.getReader();
    let size = 0,
      lastProgress = 0;
    while (true) {
      controller.signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      resetTimeout();
      size += value.byteLength;
      if (size > maximum) throw tooLarge();
      await options.onChunk(value);
      if (Date.now() - lastProgress >= 100) {
        lastProgress = Date.now();
        options.onProgress?.({
          ratio: total ? Math.min(0.95, (size / total) * 0.95) : 0,
          message: `Downloading media… ${bytes(size)}${total ? ` of ${bytes(total)}` : ''}`,
        });
      }
    }
    controller.signal.throwIfAborted();
    if (!size) throw new Error('The server returned an empty media file.');
    options.onProgress?.({ ratio: 0.98, message: 'Download complete. Reading media…' });
    return { ...file, size };
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof TypeError)
      throw new Error('Could not download this URL. Check the link and your connection.');
    throw error;
  } finally {
    clearTimeout(timeout!);
    options.signal.removeEventListener('abort', cancel);
    if (reader) {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    } else await response?.body?.cancel().catch(() => {});
  }
}
