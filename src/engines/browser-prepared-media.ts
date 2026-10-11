import { browserRuntime } from './browser-runtime';
import {
  appendVideoArgs,
  extractAudioArgs,
  extractedAudioName,
  sequenceName,
} from '../core/media-preparation';
import { MAX_IMPORT_FILES, MAX_WEB_FILE_SIZE, MAX_WEB_LIBRARY_SIZE } from '../core/imports';
import { parseProbe } from '../core/probe';
import { sourceFingerprint } from '../core/source-fingerprint';
import type { ExportProgress, MediaAsset } from '../core/types';

/** A dedicated worker prepares imported sources without blocking the browser UI thread. */
export function browserPreparedMedia(files: Map<string, File>, sources: Map<string, MediaAsset>) {
  const runtime = browserRuntime();
  let cancelled = false,
    active = false;
  async function prepare(
    base: MediaAsset,
    progress: (p: ExportProgress) => void,
    added?: MediaAsset,
  ) {
    if (active) throw new Error('Wait for media preparation to finish.');
    if (files.size >= MAX_IMPORT_FILES)
      throw new Error('Remove a library item before preparing another source.');
    const name = added ? sequenceName(base) : extractedAudioName(base),
      output = added ? 'sequence.mp4' : 'audio.flac';
    const inputs = added ? [base, added] : [base],
      paths = inputs.map((_, i) => `source-${i}`);
    const plan = added
      ? appendVideoArgs(base, added, paths as [string, string], output)
      : extractAudioArgs(base, paths[0], output);
    active = true;
    cancelled = false;
    const message = added ? 'Preparing video sequence…' : 'Extracting audio…';
    progress({ ratio: 0, message });
    try {
      const ff = await runtime.ready();
      const update = ({ time }: { time: number }) =>
        progress({
          ratio: Math.min(0.99, time / 1e6 / (base.duration + (added?.duration ?? 0))),
          message,
        });
      ff.on('progress', update);
      try {
        for (const [index, asset] of inputs.entries()) {
          const file = files.get(asset.id);
          if (!file) throw new Error('Import each source again.');
          await ff.writeFile(paths[index], new Uint8Array(await file.arrayBuffer()));
        }
        if ((await ff.exec(plan)) !== 0)
          throw new Error('Could not prepare this media. Try the desktop app for larger sources.');
        const code = await ff.ffprobe([
          '-v',
          'error',
          '-show_format',
          '-show_streams',
          '-of',
          'json',
          '-o',
          'metadata.json',
          output,
        ]);
        if (code !== 0 && code !== -1) throw new Error('Unable to read prepared media.');
        const metadata = parseProbe(JSON.parse(String(await ff.readFile('metadata.json', 'utf8'))));
        const data = await ff.readFile(output);
        if (typeof data === 'string') throw new Error('Invalid prepared media.');
        if (data.length > MAX_WEB_FILE_SIZE)
          throw new Error('Prepared media exceeds the 500 MB browser limit. Use desktop.');
        if (
          [...files.values()].reduce((total, file) => total + file.size, data.length) >
          MAX_WEB_LIBRARY_SIZE
        )
          throw new Error(
            'The browser library is limited to 800 MB. Remove unused files or use desktop.',
          );
        const file = new File([new Uint8Array(data)], name, {
          type: added ? 'video/mp4' : 'audio/flac',
        });
        const fingerprint = await sourceFingerprint(file);
        if (cancelled) throw new Error('Media preparation cancelled.');
        const asset: MediaAsset = {
          ...metadata,
          id: crypto.randomUUID(),
          name,
          size: file.size,
          fingerprint,
          previewUrl: URL.createObjectURL(file),
        };
        files.set(asset.id, file);
        sources.set(asset.id, asset);
        progress({ ratio: 1, message: added ? 'Sequence ready.' : 'Audio extracted.' });
        return asset;
      } finally {
        ff.off('progress', update);
      }
    } catch (error) {
      if (cancelled) throw new Error('Media preparation cancelled.', { cause: error });
      throw error;
    } finally {
      active = false;
      runtime.cancel();
    }
  }
  return {
    appendVideo: (base: MediaAsset, added: MediaAsset, progress: (p: ExportProgress) => void) =>
      prepare(base, progress, added),
    extractAudio: (asset: MediaAsset, progress: (p: ExportProgress) => void) =>
      prepare(asset, progress),
    cancel: () => {
      cancelled = true;
      runtime.cancel();
    },
  };
}
