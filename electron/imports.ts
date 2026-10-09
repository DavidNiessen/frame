import type { WindowIpc } from './window-ipc';
import { app, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { MAX_IMPORT_FILES, isMediaFilename } from '../src/core/imports';
import { supportedExtensions, type ImportReport, type MediaAsset } from '../src/core/types';
import { collectFolderMedia } from './folders';
import { probeFile } from './native';
import type { MediaJobs } from './jobs';
import type { LaunchInbox } from './launch-inbox';
import { registerUrlImports } from './url-imports';

export function registerImports(assets: Map<string, { path: string; asset: MediaAsset }>, jobs: MediaJobs, window: () => BrowserWindow, trusted: (event: IpcMainInvokeEvent) => void, launches: LaunchInbox, ipc: WindowIpc = ipcMain) {
  async function read(event: IpcMainInvokeEvent, inputs: { path: string; relativePath?: string }[], skipped = 0, folderName?: string, reuse = false, rawOnly = false): Promise<ImportReport> {
    const key = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
    const existing = new Map(reuse ? [...assets.values()].map(item => [key(item.path), item.asset]) : []);
    if (inputs.filter(input => !existing.has(key(input.path))).length + assets.size > MAX_IMPORT_FILES) throw new Error(`The library supports up to ${MAX_IMPORT_FILES} files. Remove some files or import a smaller folder.`);
    const report: ImportReport = { assets: [], issues: [], skipped, folderName };
    // Bound native probe concurrency. One corrupt song never discards the rest of an album.
    for (let index = 0; index < inputs.length; index += 4) {
      const results = await Promise.all(inputs.slice(index, index + 4).map(async input => {
        try {
          const previous = existing.get(key(input.path)); if (previous) return { asset: previous };
          const id = randomUUID();
          const asset: MediaAsset = { ...await probeFile(input.path, rawOnly ? { rawOnly, signal: jobs.signal } : undefined), id, name: basename(input.path), relativePath: input.relativePath, previewUrl: `media://asset/${id}` };
          if (rawOnly && jobs.signal.aborted) throw new Error('URL import cancelled.');
          if (event.sender.isDestroyed()) throw new Error('The window was closed.');
          assets.set(id, { path: input.path, asset });
          return { asset };
        } catch (error) { return { issue: { name: input.relativePath || basename(input.path), message: error instanceof Error ? error.message.slice(0, 300) : 'Unable to read this file.' } }; }
      }));
      for (const result of results) { if (result.asset) report.assets.push(result.asset); else if (result.issue) report.issues.push(result.issue); }
      if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio: Math.min(1, (index + 4) / inputs.length), message: `Read ${Math.min(index + 4, inputs.length)} of ${inputs.length} files…` });
    }
    return report;
  }
  ipc.handle('desktop:next-launch', event => { trusted(event); return launches.peek(); });
  ipc.handle('desktop:import-launch', async (event, id: string) => {
    trusted(event);
    return jobs.run(async () => {
      const request = launches.consume(id);
      if (request.error) throw new Error(request.error);
      return read(event, request.paths.map(path => ({ path })), 0, undefined, true);
    });
  });
  ipc.handle('media:import-folder', async event => {
    trusted(event);
    return jobs.run(async () => {
      const choice = await dialog.showOpenDialog(window(), { title: 'Choose a media folder', properties: ['openDirectory'] });
      if (choice.canceled || !choice.filePaths.length) return { assets: [], issues: [], skipped: 0 };
      const folder = await collectFolderMedia(choice.filePaths[0]);
      return read(event, folder.files, folder.skipped, basename(choice.filePaths[0]));
    });
  });
  ipc.handle('media:import', async (event, paths?: string[]) => {
    trusted(event);
    return jobs.run(async () => {
      if (!paths) {
        const choice = await dialog.showOpenDialog(window(), { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video and audio', extensions: supportedExtensions }] });
        paths = choice.canceled ? [] : choice.filePaths;
      }
      if (!Array.isArray(paths) || paths.length > MAX_IMPORT_FILES || paths.some(path => typeof path !== 'string' || !path)) throw new Error(`Select up to ${MAX_IMPORT_FILES} valid media files.`);
      const inputs: { path: string; relativePath?: string }[] = []; let skipped = 0;
      for (const path of paths) {
        if ((await stat(path)).isDirectory()) { const folder = await collectFolderMedia(path); inputs.push(...folder.files); skipped += folder.skipped; }
        else if (isMediaFilename(path)) inputs.push({ path });
        else skipped++;
      }
      return read(event, inputs, skipped);
    });
  });
  ipc.handle('media:sample', async event => {
    trusted(event);
    return jobs.run(() => read(event, [{ path: app.isPackaged ? join(process.resourcesPath, 'sample.mp4') : join(__dirname, '../public/sample.mp4') }]));
  });
  return registerUrlImports(assets, jobs, trusted, (event, inputs) => read(event, inputs, 0, undefined, false, true), ipc);
}
