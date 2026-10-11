import { app, BrowserWindow, ipcMain, net, shell, type IpcMainInvokeEvent } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseVersion } from '../src/core/app-updates';
import { UpdateManager } from './update-manager';

export function configureAppUpdates(trusted: (event: IpcMainInvokeEvent) => void) {
  let current = `v${app.getVersion()}${app.isPackaged ? '' : '-build.0'}`;
  try {
    const { frameReleaseTag } = JSON.parse(
      readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'),
    );
    if (
      typeof frameReleaseTag === 'string' &&
      releaseVersion(frameReleaseTag) &&
      frameReleaseTag.slice(1).split('-')[0] === app.getVersion()
    )
      current = frameReleaseTag;
  } catch {
    /* Older installations and development checkouts use the app version. */
  }
  const updates = new UpdateManager({
    current,
    development: !app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    directory: app.getPath('userData'),
    fetcher: (url, init) => net.fetch(url, init),
  });
  updates.subscribe((status) => {
    for (const window of BrowserWindow.getAllWindows())
      if (!window.isDestroyed()) window.webContents.send('desktop:update-status', status);
  });
  ipcMain.handle('updates:status', (event) => {
    trusted(event);
    return updates.status();
  });
  ipcMain.handle('updates:check', (event) => {
    trusted(event);
    return updates.check();
  });
  ipcMain.handle('updates:preferences', (event, value: unknown) => {
    trusted(event);
    return updates.preferences(value);
  });
  ipcMain.handle('updates:download', (event) => {
    trusted(event);
    return updates.download();
  });
  ipcMain.handle('updates:cancel', (event) => {
    trusted(event);
    updates.cancelDownload();
  });
  ipcMain.handle('updates:open', async (event) => {
    trusted(event);
    if (process.platform === 'linux')
      throw new Error('Use Show download and replace your current AppImage.');
    const error = await shell.openPath(await updates.installer());
    if (error) throw new Error(error);
  });
  ipcMain.handle('updates:reveal', async (event) => {
    trusted(event);
    shell.showItemInFolder(await updates.installer());
  });
  const startup = setTimeout(() => void updates.periodicCheck(), 30000);
  const timer = setInterval(() => void updates.periodicCheck(), 60 * 1000);
  startup.unref();
  timer.unref();
  return () => {
    clearTimeout(startup);
    clearInterval(timer);
    return updates.stop();
  };
}
