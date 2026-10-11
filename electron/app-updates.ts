import { app, BrowserWindow, ipcMain, net, shell, type IpcMainInvokeEvent } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseVersion } from '../src/core/app-updates';
import { UpdateManager } from './update-manager';
import { cleanupWindowsUpdateRuntimes } from './update-runtime';
import {
  armUpdateInstall,
  supportsUpdateInstall,
  type UpdateInstallLocation,
} from './update-install';

export function configureAppUpdates(
  trusted: (event: IpcMainInvokeEvent) => void,
  canRestart: () => boolean,
) {
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
  const location: UpdateInstallLocation = {
    platform: process.platform,
    arch: process.arch,
    development: !app.isPackaged,
    executable: app.getPath('exe'),
    appImage: process.env.APPIMAGE,
    userData: app.getPath('userData'),
    helperDirectory: __dirname,
  };
  const updates = new UpdateManager({
    current,
    development: !app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    directory: app.getPath('userData'),
    fetcher: (url, init) => net.fetch(url, init),
    install: supportsUpdateInstall(location)
      ? (update) => armUpdateInstall(location, update, canRestart)
      : undefined,
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
  let installing = false;
  ipcMain.handle('updates:install', async (event) => {
    trusted(event);
    if (installing) throw new Error('An update installation is already running.');
    if (!canRestart())
      throw new Error('Finish or cancel active media jobs before restarting to update.');
    installing = true;
    try {
      const status = await updates.install();
      if (status.phase === 'installing') setTimeout(() => app.quit(), 100);
      else installing = false;
      return status;
    } catch (cause) {
      installing = false;
      throw cause;
    }
  });
  ipcMain.handle('updates:reveal', async (event) => {
    trusted(event);
    shell.showItemInFolder(await updates.installer());
  });
  const startup = setTimeout(() => void updates.periodicCheck(), 30000);
  const timer = setInterval(() => void updates.periodicCheck(), 60 * 1000);
  startup.unref();
  timer.unref();
  const cleanup = setTimeout(() => {
    if (process.platform === 'win32')
      void cleanupWindowsUpdateRuntimes(location.userData).catch(() => {});
  }, 15000);
  cleanup.unref();
  return () => {
    clearTimeout(cleanup);
    clearTimeout(startup);
    clearInterval(timer);
    return updates.stop();
  };
}
