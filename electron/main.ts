import { app, BrowserWindow, dialog, ipcMain, net, protocol, type IpcMainInvokeEvent } from 'electron';
import { join, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { rename, rm, stat, realpath } from 'node:fs/promises';
import type { ChildProcess } from 'node:child_process';
import { registerProjectSaving } from './projects';
import { probeFile, transcode } from './native';
import { outputName, validateEdit } from '../src/core/export-plan';
import { supportedExtensions, type EditSettings, type MediaAsset } from '../src/core/types';

protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const assets = new Map<string, { path: string; asset: MediaAsset }>();
let mainWindow: BrowserWindow | null = null;
let currentProcess: ChildProcess | null = null;
let exporting = false;
const devUrl = !app.isPackaged ? process.env.FRAME_DEV_URL : undefined;
function trusted(event: IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Untrusted request.');
}
async function importPaths(paths: string[]) {
  const imported = await Promise.all(paths.map(async path => {
    const id = randomUUID();
    const asset: MediaAsset = { ...await probeFile(path), id, name: basename(path), previewUrl: `media://asset/${id}` };
    return { path, asset };
  }));
  for (const item of imported) assets.set(item.asset.id, item);
  return imported.map(item => item.asset);
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 960, minWidth: 760, minHeight: 600, backgroundColor: '#101311', title: 'Frame', icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../build/icon.png'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders,
      'Content-Security-Policy': [devUrl
        ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: media:; media-src 'self' blob: media:; connect-src 'self' ws://127.0.0.1:5173; font-src 'self'"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: media:; media-src 'self' blob: media:; connect-src 'self'; font-src 'self'"] } });
  });
  if (devUrl) void mainWindow.loadURL(devUrl); else void mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  mainWindow.on('closed', () => { currentProcess?.kill(); assets.clear(); mainWindow = null; });
}
app.whenReady().then(() => {
  protocol.handle('media', request => {
    const url = new URL(request.url);
    const item = url.hostname === 'asset' ? assets.get(url.pathname.slice(1)) : undefined;
    if (!item) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(item.path).toString(), { headers: request.headers });
  });
  ipcMain.handle('media:import', async (event, paths?: string[]) => {
    trusted(event);
    if (exporting) throw new Error('Wait for the current export.');
    if (!paths) {
      const selected = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video and audio', extensions: supportedExtensions }] });
      paths = selected.canceled ? [] : selected.filePaths;
    }
    if (!Array.isArray(paths) || paths.length > 100 || paths.some(path => typeof path !== 'string' || !path)) throw new Error('Select up to 100 valid media files.');
    return importPaths(paths);
  });
  ipcMain.handle('media:sample', async event => {
    trusted(event);
    return importPaths([app.isPackaged ? join(process.resourcesPath, 'sample.mp4') : join(__dirname, '../public/sample.mp4')]);
  });
  ipcMain.handle('media:release', (event, id: string) => { trusted(event); if (!exporting) assets.delete(id); });
  ipcMain.on('media:cancel', event => { trusted(event); currentProcess?.kill(); });
  ipcMain.handle('media:export', async (event, id: string, settings: EditSettings) => {
    trusted(event);
    if (exporting) throw new Error('An export is already running.');
    const item = assets.get(id);
    if (!item) throw new Error('Import the media file again.');
    validateEdit(item.asset, settings);
    exporting = true;
    let temporary: string | undefined;
    try {
      const destination = await dialog.showSaveDialog(mainWindow!, { defaultPath: outputName(item.asset.name, settings.format), filters: [{ name: settings.format.toUpperCase(), extensions: [settings.format] }] });
      if (destination.canceled || !destination.filePath) return null;
      const sourcePath = await realpath(item.path);
      const destinationPath = await realpath(destination.filePath).catch(() => destination.filePath!);
      const comparable = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
      if (comparable(destinationPath) === comparable(sourcePath)) throw new Error('Choose a different output path to preserve the original.');
      temporary = join(dirname(destination.filePath), `.frame-${randomUUID()}.${settings.format}`);
      const job = transcode(item.path, temporary, item.asset, settings, ratio => {
        if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio, message: 'Encoding your media…' });
      });
      currentProcess = job.child;
      await job.done;
      const { size } = await stat(temporary);
      await rename(temporary, destination.filePath);
      return { name: basename(destination.filePath), path: destination.filePath, size };
    } finally {
      currentProcess = null; exporting = false;
      if (temporary) await rm(temporary, { force: true });
    }
  });
  registerProjectSaving(() => mainWindow!, trusted, () => Array.from(assets.values(), item => item.path));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => currentProcess?.kill());
