import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import type { WindowIpc } from './window-ipc';
import type { SessionAssets } from './media-session';
import type { PreviewProxy } from '../src/core/hardware';
import type { TimeRange } from '../src/core/types';
import { joinedPreviewArgs, validatePreviewRanges } from '../src/core/joined-preview';
import { MediaJobs } from './jobs';
import { runFfmpeg } from './native';

/** Independent job owner: background preview work cannot interrupt exports or analysis. */
export function createJoinedPreviews(assets: SessionAssets, trusted: (event: IpcMainInvokeEvent) => void, ipc: WindowIpc) {
  const jobs = new MediaJobs(), entries = new Map<string, { source: string; path: string; directory: string }>();
  let active: Promise<PreviewProxy> | null = null, sourceId = '', generation = 0, closed = false;
  const cancel = () => { generation++; jobs.cancel(); };
  ipc.handle('media:joined-preview', async (event, id: string, ranges: TimeRange[]) => {
    trusted(event); const source = assets.get(id); if (!source) throw new Error('Import the source again.');
    validatePreviewRanges(source.asset, ranges);
    const ticket = ++generation; jobs.cancel(); await active?.catch(() => {});
    if (closed || ticket !== generation) throw new Error('Continuous preview cancelled.');
    sourceId = id;
    const task = jobs.run(async execute => {
      const directory = await mkdtemp(join(tmpdir(), 'frame-joined-')), path = join(directory, source.asset.kind === 'video' ? 'preview.mp4' : 'preview.mp3');
      try {
        const duration = ranges.reduce((sum, range) => sum + range.end - range.start, 0);
        await execute(runFfmpeg(joinedPreviewArgs(source.asset, ranges, source.path, path), duration, ratio => { if (!event.sender.isDestroyed()) event.sender.send('media:joined-preview-progress', { ratio, message: 'Preparing continuous preview…' }); }));
        if (closed || ticket !== generation || !assets.has(id)) throw new Error('Continuous preview cancelled.');
        const token = randomUUID(), size = (await stat(path)).size;
        entries.set(token, { source: id, directory, path }); return { id: token, url: `media://proxy/${token}`, size };
      } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
    });
    active = task;
    try { return await task; } finally { if (active === task) { active = null; sourceId = ''; } }
  });
  ipc.handle('media:cancel-joined-preview', event => { trusted(event); cancel(); });
  async function release(id: string) {
    const entry = entries.get(id); if (!entry) return;
    entries.delete(id); await rm(entry.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  return { path: (id: string) => entries.get(id)?.path, release,
    async releaseAsset(id: string) { if (sourceId === id) { cancel(); await active?.catch(() => {}); } for (const [token, entry] of entries) if (entry.source === id) await release(token); },
    async clear() { closed = true; cancel(); await active?.catch(() => {}); await Promise.all([...entries.keys()].map(id => release(id).catch(() => {}))); },
  };
}
