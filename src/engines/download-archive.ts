import { Zip, ZipPassThrough } from 'fflate';
import { uniqueArchivePath } from '../core/archive-paths';
import type { ExportResult } from '../core/types';

export async function createDownloadArchive(
  results: ExportResult[],
  signal: AbortSignal,
  progress: (ratio: number) => void,
): Promise<Blob> {
  const chunks: BlobPart[] = [];
  const used = new Set<string>();
  let failure: Error | null = null,
    complete = false;
  // Already compressed media needs no second compression pass. Stream into the ZIP.
  const zip = new Zip((error, data, final) => {
    if (error) failure = error;
    else {
      chunks.push(new Uint8Array(data));
      complete = final;
    }
  });
  const cancel = () => zip.terminate();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (const [index, result] of results.entries()) {
      signal.throwIfAborted();
      if (!result.url) continue;
      const file = new ZipPassThrough(uniqueArchivePath(result.relativePath || result.name, used));
      zip.add(file);
      const response = await fetch(result.url, { signal });
      if (!response.ok || !response.body)
        throw new Error('A converted file is no longer available. Convert it again.');
      const reader = response.body.getReader();
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          file.push(value);
          if (failure) throw failure;
        }
      } finally {
        reader.releaseLock();
      }
      file.push(new Uint8Array(), true);
      progress((index + 1) / results.length);
    }
    signal.throwIfAborted();
    zip.end();
    if (failure) throw failure;
    if (!complete) throw new Error('The download archive did not finish. Please try again.');
    return new Blob(chunks, { type: 'application/zip' });
  } finally {
    zip.terminate();
    signal.removeEventListener('abort', cancel);
  }
}
