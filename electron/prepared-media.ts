import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IpcMainInvokeEvent } from 'electron';
import { MAX_IMPORT_FILES } from '../src/core/imports';
import {
  appendVideoArgs,
  extractAudioArgs,
  extractedAudioName,
  sequenceName,
} from '../src/core/media-preparation';
import type { ImportReport } from '../src/core/types';
import type { SessionAssets } from './media-session';
import type { WindowIpc } from './window-ipc';
import type { MediaJobs } from './jobs';
import { runFfmpeg } from './native';

/** Generated sources have the same ownership and autosave lifecycle as downloaded files. */
export function registerPreparedMedia(
  assets: SessionAssets,
  jobs: MediaJobs,
  trusted: (event: IpcMainInvokeEvent) => void,
  ipc: WindowIpc,
  imports: {
    read: (event: IpcMainInvokeEvent, inputs: { path: string }[]) => Promise<ImportReport>;
    own: (id: string, directory: string) => void;
  },
) {
  async function prepare(event: IpcMainInvokeEvent, id: string, addedId?: string) {
    trusted(event);
    const base = assets.get(id),
      added = addedId === undefined ? undefined : assets.get(addedId);
    if (!base || (addedId !== undefined && !added)) throw new Error('Import each source again.');
    if (assets.size >= MAX_IMPORT_FILES)
      throw new Error('Remove a library item before preparing another source.');
    const name = added ? sequenceName(base.asset) : extractedAudioName(base.asset);
    // Validate before creating files or launching a native process.
    const plan = (output: string) =>
      added
        ? appendVideoArgs(base.asset, added.asset, [base.path, added.path], output)
        : extractAudioArgs(base.asset, base.path, output);
    plan('validation');
    return jobs.run(async (execute) => {
      const directory = await mkdtemp(join(tmpdir(), 'frame-prepared-')),
        output = join(directory, name);
      let retained = false,
        imported: ImportReport | undefined;
      const message = added ? 'Preparing video sequence…' : 'Extracting audio…';
      try {
        await execute(
          runFfmpeg(plan(output), base.asset.duration + (added?.asset.duration ?? 0), (ratio) => {
            if (!event.sender.isDestroyed())
              event.sender.send('media:progress', { ratio, message });
          }),
        );
        if (jobs.cancelled || event.sender.isDestroyed())
          throw new Error('Media preparation cancelled.');
        imported = await imports.read(event, [{ path: output }]);
        const result = imported.assets[0];
        if (jobs.cancelled || event.sender.isDestroyed())
          throw new Error('Media preparation cancelled.');
        if (!result)
          throw new Error(imported.issues[0]?.message || 'Unable to read the prepared media.');
        imports.own(result.id, directory);
        retained = true;
        return result;
      } finally {
        if (!retained) {
          for (const asset of imported?.assets ?? []) assets.delete(asset.id);
          await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        }
      }
    });
  }
  ipc.handle('media:append-video', (event, id: string, added: string) => {
    if (typeof added !== 'string' || !added) throw new Error('Choose a video to insert.');
    return prepare(event, id, added);
  });
  ipc.handle('media:extract-audio', (event, id: string) => prepare(event, id));
}
