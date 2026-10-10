import { conversionIndex, validateBatchOptions } from '../src/core/output-naming';
import type { WindowIpc } from './window-ipc';
import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { publishOutput, safeOutputPath } from './output-files';
import { outputName } from '../src/core/export-plan';
import { conversionName } from '../src/core/conversion';
import type { BatchOptions, MediaAsset } from '../src/core/types';
export function createBatchFolders(window: () => BrowserWindow, trusted: (event: IpcMainInvokeEvent) => void, ipc: WindowIpc = ipcMain) {
  const folders = new Map<string, { path: string; options: BatchOptions }>();
  let lastConversionFolder = '';
  ipc.handle('batch:begin', async (event, options: BatchOptions = {}) => {
    trusted(event);
    validateBatchOptions(options);
    const choice = await dialog.showOpenDialog(window(), { title: options.conversion ? 'Choose conversion output folder' : 'Choose batch export folder', defaultPath: options.conversion ? lastConversionFolder || undefined : undefined, properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled || !choice.filePaths.length) return null;
    folders.clear(); const token = randomUUID(); const path = await realpath(choice.filePaths[0]);
    folders.set(token, { path, options }); if (options.conversion) lastConversionFolder = path; return token;
  });
  ipc.handle('batch:end', (event, token: string) => { trusted(event); folders.delete(token); });
  ipc.handle('batch:open-folder', async event => { trusted(event); if (!lastConversionFolder) throw new Error('Convert some files first.'); const error = await shell.openPath(lastConversionFolder); if (error) throw new Error(error); });
  function directory(token: string): string {
    const folder = folders.get(token); if (!folder) throw new Error('Choose the batch export folder again.'); return folder.path;
  }
  function name(token: string, asset: MediaAsset, format: string) {
    const options = folders.get(token)?.options;
    return options?.conversion ? conversionName(asset, format, options.keepFolders, options.namingTemplate, conversionIndex(options, asset.id)) : outputName(asset.name, format);
  }
  const destination = (token: string, name: string) => safeOutputPath(directory(token), name);
  const publish = (temporary: string, token: string, name: string) => publishOutput(temporary, directory(token), name);
  return { directory, name, destination, publish };
}
