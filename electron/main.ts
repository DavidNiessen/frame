import { registerAcceleration, encodeNative } from './acceleration';
import { createProxies } from './proxies';
import { hardwareBitrate } from '../src/core/hardware';
import { editedDuration } from '../src/core/timeline';
import { frameDimensions } from '../src/core/geometry';
import { withResources } from './resources';
import { app, BrowserWindow, dialog, ipcMain, protocol, type IpcMainInvokeEvent } from 'electron';
import { join, basename, dirname } from 'node:path';
import { mediaResponse } from './media-response';
import { randomUUID } from 'node:crypto';
import { rename, rm, stat, realpath } from 'node:fs/promises';
import { MediaJobs } from './jobs';
import { registerMerge } from './merge';
import { registerAnalysis } from './analysis';
import { createBatchFolders } from './batch';
import { registerImports } from './imports';
import { registerProjectSaving } from './projects';
import { LaunchInbox } from './launch-inbox';
import { launchArguments } from './launch-arguments';
import { configureSystemIntegration, shellStartupCommand } from './system-integration';
import { buildExportArgs, outputName, validateEdit } from '../src/core/export-plan';
import { type EditSettings, type MediaAsset } from '../src/core/types';

protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const assets = new Map<string, { path: string; asset: MediaAsset }>();
let clearProxies = () => {};
let mainWindow: BrowserWindow | null = null;
let desktopReady = false;
let creatingWindow = false;
const jobs = new MediaJobs();
const shellCommand = shellStartupCommand(process.argv);
const ownsInstance = !!shellCommand || app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
const launches = new LaunchInbox(() => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:launch-available'); });
function focusWindow() {
  if (!desktopReady) return;
  if (!mainWindow) createWindow();
  if (!mainWindow) return;
  if (mainWindow!.isMinimized()) mainWindow!.restore();
  mainWindow!.show(); mainWindow!.focus();
}
if (ownsInstance && !shellCommand) {
  const initial = launchArguments(process.argv, process.cwd()); if (initial) launches.enqueue(initial);
  app.on('second-instance', (_event, argv, cwd) => { const request = launchArguments(argv, cwd); if (request) launches.enqueue(request); focusWindow(); });
  app.on('open-file', (event, path) => { event.preventDefault(); const request = launchArguments([process.execPath, '--', path], process.cwd()); if (request) launches.enqueue(request); focusWindow(); });
}
const devUrl = !app.isPackaged ? process.env.FRAME_DEV_URL : undefined;
function trusted(event: IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Untrusted request.');
}
function createWindow() {
  // Native file-open events can reenter while BrowserWindow is being constructed.
  if (mainWindow || creatingWindow) return;
  creatingWindow = true;
  try {
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
  mainWindow.on('closed', () => { jobs.cancel(); clearProxies(); assets.clear(); mainWindow = null; });
  } finally { creatingWindow = false; }
}
app.whenReady().then(() => {
  if (!ownsInstance) return;
  if (configureSystemIntegration(shellCommand)) return;
  registerAcceleration(jobs, trusted);
  const proxies = createProxies(assets, jobs, trusted); clearProxies = proxies.clear;
  const batchFolders = createBatchFolders(() => mainWindow!, trusted);
  protocol.handle('media', request => {
    const url = new URL(request.url);
    const id = url.pathname.slice(1); const path = url.hostname === 'asset' ? assets.get(id)?.path : url.hostname === 'proxy' ? proxies.path(id) : undefined;
    if (!path) return new Response('Not found', { status: 404 });
    return mediaResponse(path, request);
  });
  registerImports(assets, jobs, () => mainWindow!, trusted, launches);
  registerAnalysis(assets, jobs, trusted);
  registerMerge(assets, jobs, () => mainWindow!, trusted);
  ipcMain.handle('media:release', async (event, id: string) => { trusted(event); if (!jobs.busy) { assets.delete(id); await proxies.releaseAsset(id); } });
  ipcMain.on('media:cancel', event => { trusted(event); jobs.cancel(); });
  ipcMain.handle('media:export', async (event, id: string, settings: EditSettings, batchToken?: string) => {
    trusted(event);
    if (jobs.busy) throw new Error('An export is already running.');
    const item = assets.get(id);
    if (!item) throw new Error('Import the media file again.');
    validateEdit(item.asset, settings);
    return jobs.run(async execute => {
    let temporary: string | undefined;
    try {
      const batchName = batchToken ? batchFolders.name(batchToken, item.asset, settings.format) : outputName(item.asset.name, settings.format);
      const destination = batchToken ? { canceled: false, filePath: await batchFolders.destination(batchToken, batchName) } : await dialog.showSaveDialog(mainWindow!, { defaultPath: outputName(item.asset.name, settings.format), filters: [{ name: settings.format.toUpperCase(), extensions: [settings.format] }] });
      if (destination.canceled || !destination.filePath) return null;
      const sourcePath = await realpath(item.path);
      const destinationPath = await realpath(destination.filePath).catch(() => destination.filePath!);
      const comparable = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
      if (!batchToken && comparable(destinationPath) === comparable(sourcePath)) throw new Error('Choose a different output path to preserve the original.');
      temporary = join(dirname(destination.filePath), `.frame-${randomUUID()}.${settings.format}`);
      await withResources([settings], async paths => {
        const { width, height } = frameDimensions(item.asset, settings);
        await encodeNative(buildExportArgs(item.asset, settings, item.path, temporary!, paths[0]), editedDuration(settings), settings.acceleration, hardwareBitrate(width, height, settings.quality), execute, jobs, (ratio, message) => {
          if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio, message });
        });
      }, [item.asset]);
      const { size } = await stat(temporary);
      const savedPath = batchToken ? await batchFolders.publish(temporary, batchToken, batchName) : destination.filePath;
      if (!batchToken) await rename(temporary, savedPath);
      return { name: basename(savedPath), path: savedPath, size };
    } finally {
      if (temporary) await rm(temporary, { force: true });
    }
    });
  });
  registerProjectSaving(() => mainWindow!, trusted, () => Array.from(assets.values(), item => item.path));
  desktopReady = true;
  if (!mainWindow) createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { jobs.cancel(); clearProxies(); });
