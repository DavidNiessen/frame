import { app, type BrowserWindow } from 'electron';
import { join } from 'node:path';

export const devUrl = !app.isPackaged ? process.env.FRAME_DEV_URL : undefined;
export function prepareWindow(window: BrowserWindow) {
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders,
      'Content-Security-Policy': [devUrl
        ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: media:; media-src 'self' blob: media:; connect-src 'self' ws://127.0.0.1:5173; font-src 'self'"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: media:; media-src 'self' blob: media:; connect-src 'self'; font-src 'self'"] } });
  });
}
export function loadWindow(window: BrowserWindow) {
  if (devUrl) void window.loadURL(devUrl); else void window.loadFile(join(__dirname, '../dist/index.html'));
}
