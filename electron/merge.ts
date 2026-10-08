import { withResources } from './resources';
import { serializeSrt } from '../src/core/subtitles';
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { dirname, join, basename } from 'node:path';
import { realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { parseTransition } from '../src/core/transitions';
import { buildMergeArgs, compositionAsset, mergedCues } from '../src/core/composition';
import { parseEdit } from '../src/core/project';
import { parseOutputSettings } from '../src/core/presets';
import type { MediaAsset } from '../src/core/types';
import type { MediaJobs } from './jobs';
import { runFfmpeg } from './native';
export function registerMerge(assets: Map<string, { path: string; asset: MediaAsset }>, jobs: MediaJobs, window: () => BrowserWindow, trusted: (event: IpcMainInvokeEvent) => void) {
  ipcMain.handle('media:merge', async (event, entries: { id: string; edit: unknown }[], value: unknown, transitionValue?: unknown) => {
    trusted(event);
    if (!Array.isArray(entries) || entries.length < 2 || entries.length > 100) throw new Error('Choose 2–100 clips.');
    const sources = entries.map(entry => { const source = assets.get(entry?.id); if (!source) throw new Error('Import each merge source again.'); return { ...source, edit: parseEdit(entry.edit, source.asset) }; });
    const transition = parseTransition(transitionValue);
    const settings = parseOutputSettings(value); const clips = sources.map(s => ({ asset: s.asset, edit: s.edit }));
    const asset = compositionAsset(clips, transition); buildMergeArgs(clips, settings, sources.map(s => s.path), 'validation', transition);
    return jobs.run(async execute => {
      const destination = await dialog.showSaveDialog(window(), { defaultPath: `merged.${settings.format}`, filters: [{ name: settings.format.toUpperCase(), extensions: [settings.format] }] });
      if (destination.canceled || !destination.filePath) return null;
      const normalize = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
      const target = normalize(await realpath(destination.filePath).catch(() => destination.filePath!));
      for (const source of sources) if (normalize(await realpath(source.path)) === target) throw new Error('Choose a different output path to preserve the original.');
      const temporary = join(dirname(destination.filePath), `.frame-${randomUUID()}.${settings.format}`);
      try {
        await withResources(clips.map(c => c.edit), async (paths, directory) => {
          const captions = join(directory, 'merged.srt'); await writeFile(captions, serializeSrt(mergedCues(clips, transition)));
          await execute(runFfmpeg(buildMergeArgs(clips, settings, sources.map(s => s.path), temporary, transition, paths, captions), asset.duration, ratio => {
            if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio, message: 'Merging your clips…' });
          }));
        }, clips.map(c => c.asset));
        const { size } = await stat(temporary); await rename(temporary, destination.filePath);
        return { name: basename(destination.filePath), path: destination.filePath, size };
      } finally { await rm(temporary, { force: true }); }
    });
  });
}
