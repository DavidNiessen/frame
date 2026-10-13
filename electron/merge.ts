import { mergedChapters, serializeChapters } from '../src/core/chapters';
import { recordExport } from './export-history';
import { resolveAudioLayers } from '../src/core/audio-layers';
import type { WindowIpc } from './window-ipc';
import { hardwareBitrate } from '../src/core/hardware';
import { encodeNative } from './acceleration';
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
export function registerMerge(
  assets: Map<string, { path: string; asset: MediaAsset }>,
  jobs: MediaJobs,
  window: () => BrowserWindow,
  trusted: (event: IpcMainInvokeEvent) => void,
  ipc: WindowIpc = ipcMain,
) {
  ipc.handle(
    'media:merge',
    async (
      event,
      entries: { id: string; edit: unknown }[],
      value: unknown,
      transitionValue?: unknown,
    ) => {
      trusted(event);
      if (!Array.isArray(entries) || entries.length < 2 || entries.length > 100)
        throw new Error('Choose 2–100 clips.');
      const sources = entries.map((entry) => {
        const source = assets.get(entry?.id);
        if (!source) throw new Error('Import each merge source again.');
        return { ...source, edit: parseEdit(entry.edit, source.asset) };
      });
      const transition = parseTransition(transitionValue);
      const settings = parseOutputSettings(value);
      const clips = sources.map((s) => ({ asset: s.asset, edit: s.edit }));
      const mixes = clips.map((clip) => resolveAudioLayers(clip.edit, [...assets.values()]));
      const asset = compositionAsset(clips, transition);
      buildMergeArgs(
        clips,
        settings,
        sources.map((s) => s.path),
        'validation',
        transition,
        undefined,
        undefined,
        mixes,
      );
      return jobs.run(async (execute) => {
        const destination = await dialog.showSaveDialog(window(), {
          defaultPath: `merged.${settings.format}`,
          filters: [{ name: settings.format.toUpperCase(), extensions: [settings.format] }],
        });
        if (destination.canceled || !destination.filePath) return null;
        const normalize = (path: string) =>
          process.platform === 'win32' ? path.toLowerCase() : path;
        const target = normalize(
          await realpath(destination.filePath).catch(() => destination.filePath!),
        );
        for (const source of [...sources, ...mixes.flat()])
          if (normalize(await realpath(source.path)) === target)
            throw new Error('Choose a different output path to preserve the original.');
        const temporary = join(
          dirname(destination.filePath),
          `.frame-${randomUUID()}.${settings.format}`,
        );
        try {
          await withResources(
            clips.map((c) => c.edit),
            async (paths, directory) => {
              const captions = join(directory, 'merged.srt');
              await writeFile(captions, serializeSrt(mergedCues(clips, transition)));
              await writeFile(
                `${captions}-chapters.ffmetadata`,
                serializeChapters(mergedChapters(clips, transition)),
              );
              await encodeNative(
                buildMergeArgs(
                  clips,
                  settings,
                  sources.map((s) => s.path),
                  temporary,
                  transition,
                  paths,
                  captions,
                  mixes,
                ),
                asset.duration,
                settings.acceleration,
                hardwareBitrate(asset.width ?? 640, asset.height ?? 360, settings.quality),
                execute,
                jobs,
                (ratio, message) => {
                  if (!event.sender.isDestroyed())
                    event.sender.send('media:progress', { ratio, message });
                },
              );
            },
            clips.map((c) => c.asset),
            [...assets.values()],
          );
          const { size } = await stat(temporary);
          await rename(temporary, destination.filePath);
          const result = { name: basename(destination.filePath), path: destination.filePath, size };
          await recordExport(result, 'merge', 'Merged clips', settings.format);
          return result;
        } finally {
          await rm(temporary, { force: true });
        }
      });
    },
  );
}
