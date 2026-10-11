import type { WindowIpc } from './window-ipc';
import { ipcMain, net, type IpcMainInvokeEvent } from 'electron';
import { mkdtemp, open, rm, type FileHandle } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAX_IMPORT_FILES } from '../src/core/imports';
import { mediaUrl } from '../src/core/remote-media';
import { youtubeOptions, youtubeVideo } from '../src/core/youtube';
import { downloadYoutube } from './youtube-download';
import { downloadRemoteMedia } from '../src/engines/remote-download';
import type { ExportProgress, ImportReport, MediaAsset } from '../src/core/types';
import type { MediaJobs } from './jobs';

export function registerUrlImports(
  assets: Map<string, { path: string; asset: MediaAsset }>,
  jobs: MediaJobs,
  trusted: (event: IpcMainInvokeEvent) => void,
  read: (event: IpcMainInvokeEvent, inputs: { path: string }[]) => Promise<ImportReport>,
  ipc: WindowIpc = ipcMain,
) {
  const directories = new Map<string, string>(),
    pending = new Set<string>();
  ipc.handle('media:import-url', (event, input: unknown, options: unknown) => {
    trusted(event);
    const url = mediaUrl(input).href;
    const youtube = youtubeVideo(url);
    if (youtube) youtubeOptions(options);
    return jobs.run(async () => {
      if (assets.size >= MAX_IMPORT_FILES)
        throw new Error('The library is full. Remove files before loading another URL.');
      const signal = jobs.signal;
      const directory = await mkdtemp(join(tmpdir(), 'frame-download-'));
      pending.add(directory);
      let file: FileHandle | undefined,
        path = '',
        retained = false;
      let report: ImportReport | undefined;
      try {
        const progress = (value: ExportProgress) => {
          if (!event.sender.isDestroyed()) event.sender.send('media:progress', value);
        };
        if (youtube) path = await downloadYoutube(youtube, directory, options, signal, progress);
        else {
          await downloadRemoteMedia(url, {
            signal,
            fetcher: (url, init) => net.fetch(url, init),
            onOpen: async (media) => {
              path = join(directory, media.name);
              file = await open(path, 'wx');
            },
            onChunk: async (chunk) => {
              await file!.writeFile(chunk);
            },
            onProgress: progress,
          });
          await file!.close();
          file = undefined;
        }
        if (signal.aborted || event.sender.isDestroyed()) throw new Error('URL import cancelled.');
        report = await read(event, [{ path }]);
        if (signal.aborted || event.sender.isDestroyed()) throw new Error('URL import cancelled.');
        if (report.assets.length) {
          directories.set(report.assets[0].id, directory);
          retained = true;
        }
        return report;
      } catch (error) {
        for (const asset of report?.assets || []) assets.delete(asset.id);
        if (signal.aborted) throw new Error('URL import cancelled.', { cause: error });
        throw error;
      } finally {
        await file?.close().catch(() => {});
        if (!retained)
          await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        pending.delete(directory);
      }
    });
  });
  return {
    own: (id: string, directory: string) => {
      directories.set(id, directory);
    },
    temporary: (id: string) => directories.has(id),
    release: async (id: string) => {
      const directory = directories.get(id);
      if (!directory) return;
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      directories.delete(id);
    },
    clear: () => {
      for (const directory of new Set([...directories.values(), ...pending])) {
        try {
          rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
          for (const [id, path] of directories) if (path === directory) directories.delete(id);
          pending.delete(directory);
        } catch {
          /* Retry held files on the next window-close / application-quit cleanup. */
        }
      }
    },
  };
}
