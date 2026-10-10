import { app, BrowserWindow, Notification, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { completionMessage, parseCompletion } from '../src/core/completion-notifications';
export function configureCompletionNotifications(trusted: (event: IpcMainInvokeEvent) => void) {
  if (process.platform === 'win32') app.setAppUserModelId('io.frame.mediaeditor');
  const path = join(app.getPath('userData'), 'completion-notifications.json');
  let enabled = true, queue = Promise.resolve();
  const ready = readFile(path, 'utf8').then(text => { const data = JSON.parse(text); if (typeof data.enabled === 'boolean') enabled = data.enabled; }).catch(() => {});
  const status = () => ({ supported: Notification.isSupported(), enabled });
  ipcMain.handle('desktop:notification-preference', async event => { trusted(event); await ready; return status(); });
  ipcMain.handle('desktop:set-notifications', (event, value: unknown) => {
    trusted(event); if (typeof value !== 'boolean') throw new Error('Choose whether completion notifications are enabled.');
    const work = queue.then(async () => {
      await ready; const temporary = `${path}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify({ enabled: value }), { mode: 0o600 }); await rename(temporary, path); enabled = value; return status(); }
      finally { await rm(temporary, { force: true }); }
    }); queue = work.then(() => {}, () => {}); return work;
  });
  ipcMain.handle('desktop:notify-completion', async (event, value: unknown) => {
    trusted(event); const summary = parseCompletion(value); await ready; await queue;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!enabled || !Notification.isSupported() || window?.isFocused()) return;
    const notification = new Notification({ ...completionMessage(summary), silent: true });
    notification.on('click', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
    notification.show();
    const timer = setTimeout(() => notification.close(), 5000); timer.unref();
    notification.once('close', () => clearTimeout(timer));
  });
}
