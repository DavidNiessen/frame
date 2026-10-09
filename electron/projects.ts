import type { WindowIpc } from './window-ipc';
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile, realpath } from 'node:fs/promises';
import { parseProject, projectFilename } from '../src/core/project';
export function registerProjectSaving(window: () => BrowserWindow, trusted: (event: IpcMainInvokeEvent) => void, sourcePaths: () => string[], ipc: WindowIpc = ipcMain) {
  ipc.handle('project:save', async (event, value: unknown) => {
    trusted(event);
    const project = parseProject(value);
    const destination = await dialog.showSaveDialog(window(), { defaultPath: projectFilename(project.name), filters: [{ name: 'Frame project', extensions: ['json'] }] });
    if (destination.canceled || !destination.filePath) return false;
    // A project must never overwrite imported media, even if a user changes the extension.
    const normalize = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
    const target = normalize(await realpath(destination.filePath).catch(() => destination.filePath!));
    for (const path of sourcePaths()) if (normalize(await realpath(path)) === target) throw new Error('Choose a different project path to preserve the original.');
    const temporary = join(dirname(destination.filePath), `.frame-${randomUUID()}.json`);
    try { await writeFile(temporary, JSON.stringify(project, null, 2), { flag: 'wx' }); await rename(temporary, destination.filePath); }
    finally { await rm(temporary, { force: true }); }
    return true;
  });
}
