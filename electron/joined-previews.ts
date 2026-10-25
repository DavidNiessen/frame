import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import type { WindowIpc } from './window-ipc';
import type { SessionAssets } from './media-session';
import type { PreviewProxy } from '../src/core/hardware';
import type { EditSettings, TimeRange } from '../src/core/types';
import { joinedPreviewArgs, validatePreviewRanges } from '../src/core/joined-preview';
import {
  audioPreviewAsset,
  effectPreviewArgs,
  effectPreviewRecipe,
} from '../src/core/effect-preview';
import { parseEdit } from '../src/core/project';
import { resolveAudioLayers } from '../src/core/audio-layers';
import { editedDuration } from '../src/core/timeline';
import { withResources } from './resources';
import { MediaJobs } from './jobs';
import { encodeNative } from './acceleration';

/** Independent job owner: background preview work cannot interrupt exports or analysis. */
export function createJoinedPreviews(
  assets: SessionAssets,
  trusted: (event: IpcMainInvokeEvent) => void,
  ipc: WindowIpc,
) {
  const jobs = new MediaJobs(),
    entries = new Map<string, { source: string; path: string; directory: string }>();
  let active: Promise<PreviewProxy> | null = null,
    sourceId = '',
    generation = 0,
    closed = false;
  const cancel = () => {
    generation++;
    jobs.cancel();
  };
  async function generate(
    event: IpcMainInvokeEvent,
    id: string,
    ranges: TimeRange[],
    settings?: EditSettings,
    audioOnly = false,
  ) {
    trusted(event);
    const stored = assets.get(id);
    if (!stored) throw new Error('Import the source again.');
    const source = audioOnly ? { ...stored, asset: audioPreviewAsset(stored.asset) } : stored;
    validatePreviewRanges(source.asset, ranges);
    const edit = settings
      ? effectPreviewRecipe(source.asset, parseEdit(settings, stored.asset))
      : undefined;
    const layers = edit ? resolveAudioLayers(edit, [...assets.values()]) : [];
    const message = edit ? 'Preparing effects preview…' : 'Preparing continuous preview…';
    const ticket = ++generation;
    jobs.cancel();
    await active?.catch(() => {});
    if (closed || ticket !== generation) throw new Error('Continuous preview cancelled.');
    sourceId = id;
    const task = jobs.run(async (execute) => {
      const directory = await mkdtemp(join(tmpdir(), 'frame-joined-')),
        path = join(
          directory,
          source.asset.kind === 'image'
            ? 'preview.png'
            : source.asset.kind === 'video'
              ? 'preview.mp4'
              : 'preview.mp3',
        );
      try {
        const duration = edit
          ? editedDuration(edit)
          : ranges.reduce((sum, range) => sum + range.end - range.start, 0);
        const render = (plan: string[]) =>
          encodeNative(plan, duration, 'auto', 2500, execute, jobs, (ratio) => {
            if (!event.sender.isDestroyed())
              event.sender.send('media:joined-preview-progress', { ratio, message });
          });
        if (edit)
          await withResources(
            [edit],
            (paths) =>
              render(effectPreviewArgs(source.asset, edit, source.path, path, paths[0], layers)),
            [source.asset],
            [...assets.values()],
          );
        else await render(joinedPreviewArgs(source.asset, ranges, source.path, path));
        if (closed || ticket !== generation || !assets.has(id))
          throw new Error('Continuous preview cancelled.');
        const token = randomUUID(),
          size = (await stat(path)).size;
        entries.set(token, { source: id, directory, path });
        return { id: token, url: `media://proxy/${token}`, size };
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
    });
    active = task;
    try {
      return await task;
    } finally {
      if (active === task) {
        active = null;
        sourceId = '';
      }
    }
  }
  ipc.handle('media:joined-preview', (event, id: string, ranges: TimeRange[]) =>
    generate(event, id, ranges),
  );
  ipc.handle('media:effect-preview', (event, id: string, edit: EditSettings, audioOnly?: boolean) =>
    generate(
      event,
      id,
      [{ start: 0, end: assets.get(id)?.asset.duration ?? 0 }],
      edit,
      audioOnly === true,
    ),
  );
  ipc.handle('media:cancel-joined-preview', (event) => {
    trusted(event);
    cancel();
  });
  async function release(id: string) {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    await rm(entry.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  return {
    path: (id: string) => entries.get(id)?.path,
    release,
    async releaseAsset(id: string) {
      if (sourceId === id) {
        cancel();
        await active?.catch(() => {});
      }
      for (const [token, entry] of entries) if (entry.source === id) await release(token);
    },
    async clear() {
      closed = true;
      cancel();
      await active?.catch(() => {});
      await Promise.all([...entries.keys()].map((id) => release(id).catch(() => {})));
    },
  };
}
