import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, parse } from 'node:path';
import { copyFile, constants } from 'node:fs/promises';
export function createBatchFolders(window: () => BrowserWindow, trusted: (event: IpcMainInvokeEvent) => void) {
  const folders = new Map<string, string>();
  ipcMain.handle('batch:begin', async event => {
    trusted(event);
    const choice = await dialog.showOpenDialog(window(), { title: 'Choose batch export folder', properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled || !choice.filePaths.length) return null;
    folders.clear(); const token = randomUUID(); folders.set(token, choice.filePaths[0]); return token;
  });
  ipcMain.handle('batch:end', (event, token: string) => { trusted(event); folders.delete(token); });
  function directory(token: string): string {
    const folder = folders.get(token); if (!folder) throw new Error('Choose the batch export folder again.'); return folder;
  }
  async function publish(temporary: string, token: string, name: string): Promise<string> {
    const folder = directory(token); const parts = parse(name);
    for (let index = 0; index < 10000; index++) {
      const destination = join(folder, index ? `${parts.name}-${index}${parts.ext}` : name);
      try { await copyFile(temporary, destination, constants.COPYFILE_EXCL); return destination; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    throw new Error('Too many files with this name in the export folder.');
  }
  return { directory, publish };
}
