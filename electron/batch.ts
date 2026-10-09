import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, parse, dirname } from 'node:path';
import { copyFile, constants, lstat, mkdir, realpath } from 'node:fs/promises';
import { outputName } from '../src/core/export-plan';
import { conversionName } from '../src/core/conversion';
import type { BatchOptions, MediaAsset } from '../src/core/types';
export function createBatchFolders(window: () => BrowserWindow, trusted: (event: IpcMainInvokeEvent) => void) {
  const folders = new Map<string, { path: string; options: BatchOptions }>();
  let lastFolder = '';
  ipcMain.handle('batch:begin', async (event, options: BatchOptions = {}) => {
    trusted(event);
    if (!options || typeof options !== 'object' || ['conversion', 'keepFolders'].some(key => options[key as keyof BatchOptions] !== undefined && typeof options[key as keyof BatchOptions] !== 'boolean')) throw new Error('Invalid batch options.');
    const choice = await dialog.showOpenDialog(window(), { title: 'Choose batch export folder', properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled || !choice.filePaths.length) return null;
    folders.clear(); const token = randomUUID(); const path = await realpath(choice.filePaths[0]);
    folders.set(token, { path, options }); lastFolder = path; return token;
  });
  ipcMain.handle('batch:end', (event, token: string) => { trusted(event); folders.delete(token); });
  ipcMain.handle('batch:open-folder', async event => { trusted(event); if (!lastFolder) throw new Error('Convert some files first.'); const error = await shell.openPath(lastFolder); if (error) throw new Error(error); });
  function directory(token: string): string {
    const folder = folders.get(token); if (!folder) throw new Error('Choose the batch export folder again.'); return folder.path;
  }
  function name(token: string, asset: MediaAsset, format: string) {
    const options = folders.get(token)?.options;
    return options?.conversion ? conversionName(asset, format, options.keepFolders) : outputName(asset.name, format);
  }
  async function destination(token: string, name: string) {
    const segments = name.replace(/\\/g, '/').split('/');
    if (segments.some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw new Error('Invalid output folder structure.');
    let parent = directory(token);
    for (const segment of segments.slice(0, -1)) {
      parent = join(parent, segment);
      const existing = await lstat(parent).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
      if (existing?.isSymbolicLink()) throw new Error('Output subfolders must not be symbolic links. Choose another destination.');
      if (!existing) await mkdir(parent);
    }
    return join(parent, segments.at(-1)!);
  }
  async function publish(temporary: string, token: string, name: string): Promise<string> {
    const target = await destination(token, name); const folder = dirname(target); const parts = parse(target);
    for (let index = 0; index < 10000; index++) {
      const destination = join(folder, index ? `${parts.name}-${index}${parts.ext}` : name);
      try { await copyFile(temporary, destination, constants.COPYFILE_EXCL); return destination; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    throw new Error('Too many files with this name in the export folder.');
  }
  return { directory, name, destination, publish };
}
