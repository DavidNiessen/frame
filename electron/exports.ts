import { resolveMediaLayers } from '../src/core/media-layers';
import { writeImageMetadata } from '../src/core/image-metadata-export';
import { readFile, writeFile } from 'node:fs/promises';
import { taggedNamingAsset } from '../src/core/media-tags';
import { recordExport } from './export-history';
import { resolveAudioLayers } from '../src/core/audio-layers';
import { dialog, type BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { realpath, rename, rm, stat } from 'node:fs/promises';
import { buildExportArgs, outputName, validateEdit } from '../src/core/export-plan';
import { hardwareBitrate } from '../src/core/hardware';
import { editedDuration } from '../src/core/timeline';
import { frameDimensions } from '../src/core/geometry';
import type { EditSettings } from '../src/core/types';
import { encodeNative } from './acceleration';
import { withResources } from './resources';
import type { createBatchFolders } from './batch';
import type { MediaJobs } from './jobs';
import type { SessionAssets } from './media-session';
import type { WindowIpc } from './window-ipc';

export function registerExports(
  window: BrowserWindow,
  assets: SessionAssets,
  jobs: MediaJobs,
  folders: ReturnType<typeof createBatchFolders>,
  ipc: WindowIpc,
) {
  ipc.handle(
    'media:export',
    async (event, id: string, settings: EditSettings, batchToken?: string) => {
      if (jobs.busy) throw new Error('An export is already running.');
      const item = assets.get(id);
      if (!item) throw new Error('Import the media file again.');
      validateEdit(item.asset, settings);
      const layers = resolveAudioLayers(settings, [...assets.values()]);
      const visual = resolveMediaLayers(
        settings,
        [...assets.values()].map((item) => ({ ...item, path: item.originalPath ?? item.path })),
      );
      return jobs.run(async (execute) => {
        let temporary: string | undefined;
        try {
          const batchName = batchToken
            ? folders.name(
                batchToken,
                taggedNamingAsset(item.asset, settings.outputTags),
                settings.format,
              )
            : outputName(item.asset.name, settings.format);
          const destination = batchToken
            ? { canceled: false, filePath: await folders.destination(batchToken, batchName) }
            : await dialog.showSaveDialog(window, {
                defaultPath: outputName(item.asset.name, settings.format),
                filters: [{ name: settings.format.toUpperCase(), extensions: [settings.format] }],
              });
          if (destination.canceled || !destination.filePath) return null;
          const sourcePath = await realpath(item.originalPath ?? item.path);
          const destinationPath = await realpath(destination.filePath).catch(
            () => destination.filePath!,
          );
          const comparable = (path: string) =>
            process.platform === 'win32' ? path.toLowerCase() : path;
          if (
            !batchToken &&
            [
              sourcePath,
              ...(await Promise.all([...layers, ...visual].map((layer) => realpath(layer.path)))),
            ].some((path) => comparable(destinationPath) === comparable(path))
          )
            throw new Error('Choose a different output path to preserve the original.');
          temporary = join(
            dirname(destination.filePath),
            `.frame-${randomUUID()}.${settings.format}`,
          );
          await withResources(
            [settings],
            async (paths) => {
              const { width, height } = frameDimensions(item.asset, settings);
              await encodeNative(
                buildExportArgs(item.asset, settings, item.path, temporary!, paths[0], layers),
                editedDuration(settings),
                settings.acceleration,
                hardwareBitrate(width, height, settings.quality),
                execute,
                jobs,
                (ratio, message) => {
                  if (!event.sender.isDestroyed())
                    event.sender.send('media:progress', { ratio, message });
                },
                { allCores: true },
              );
            },
            [item.asset],
            [...assets.values()],
          );
          if (item.asset.kind === 'image')
            await writeFile(
              temporary,
              writeImageMetadata(await readFile(temporary), item.asset, settings),
            );
          const { size } = await stat(temporary);
          if (jobs.cancelled || window.isDestroyed()) throw new Error('Conversion cancelled.');
          const savedPath = batchToken
            ? await folders.publish(temporary, batchToken, batchName)
            : destination.filePath;
          if (!batchToken) await rename(temporary, savedPath);
          const result = { name: basename(savedPath), path: savedPath, size };
          await recordExport(
            result,
            batchToken ? folders.kind(batchToken) : 'export',
            item.asset.name,
            settings.format,
          );
          return result;
        } finally {
          if (temporary) await rm(temporary, { force: true });
        }
      });
    },
  );
}
