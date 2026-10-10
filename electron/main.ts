import { configureCompletionNotifications } from './completion-notifications';
import { configureWatchFolders } from './watch-folders';
import { app, BrowserWindow, ipcMain, protocol, screen, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';
import { join } from 'node:path';
import { mediaResponse } from './media-response';
import { LaunchInbox } from './launch-inbox';
import { launchArguments, type LaunchFiles } from './launch-arguments';
import { configureSystemIntegration, shellStartupCommand } from './system-integration';
import { WindowIpcRouter } from './window-ipc';
import { createMediaSession, type MediaSession } from './media-session';
import { configureMiniWindow } from './mini-window';
import { loadWindow, prepareWindow } from './window-security';
import { configureWindowControls } from './window-controls';
import { editorBounds } from './editor-chrome';
import { desktopChromeSpace } from '../src/core/window-controls';

type WindowKind = 'editor' | 'mini';
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const windows = new Map<WindowKind, BrowserWindow>(), sessions = new Map<number, MediaSession>();
const creating = new Set<WindowKind>(), router = new WindowIpcRouter();
let desktopReady = false, lastClosed: WindowKind = 'editor';
let stopWatchFolders = () => {};
const shellCommand = shellStartupCommand(process.argv);
const ownsInstance = !!shellCommand || app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
const inboxes = { editor: new LaunchInbox(() => notify('editor')), mini: new LaunchInbox(() => notify('mini')) };
function notify(kind: WindowKind) {
  const window = windows.get(kind);
  if (window && !window.isDestroyed()) window.webContents.send('desktop:launch-available');
}
function trusted(event: IpcMainInvokeEvent | IpcMainEvent) {
  if (!sessions.has(event.sender.id) || event.senderFrame !== event.sender.mainFrame) throw new Error('Untrusted request.');
}
function openWindow(kind: WindowKind) {
  if (!desktopReady || creating.has(kind)) return;
  const previous = windows.get(kind);
  if (previous) {
    if (previous.isMinimized()) previous.restore();
    previous.show(); previous.focus(); return;
  }
  creating.add(kind);
  try {
    const mini = kind === 'mini';
    const window = new BrowserWindow({
      ...(mini ? { width: 460, height: 740 } : editorBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea)),
      ...(mini ? { frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, maximizable: false, minimizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: true }
        : { frame: false, transparent: true, backgroundColor: '#00000000', minWidth: 760, minHeight: 600 + desktopChromeSpace }),
      show: false, title: mini ? 'Frame — Quick conversion' : 'Frame',
      icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../build/icon.png'),
      webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: mini ? ['--frame-mini-conversion'] : [] },
    });
    windows.set(kind, window);
    const id = window.webContents.id, ipc = router.scope(window);
    const session = createMediaSession(window, inboxes[kind], ipc); sessions.set(id, session);
    if (mini) {
      const layout = configureMiniWindow(window);
      ipc.handle('desktop:mini-expanded', (_event, expanded: unknown, reducedMotion: unknown) => layout.setExpanded(expanded, reducedMotion));
      ipc.handle('desktop:mini-dismiss', () => { if (session.jobs.busy) throw new Error('Cancel conversion before closing.'); window.close(); });
      ipc.handle('desktop:mini-finish', () => {
        if (session.jobs.busy || inboxes.mini.peek()) { notify('mini'); return false; }
        window.close(); return true;
      });
    } else configureWindowControls(window, ipc);
    window.once('closed', () => { windows.delete(kind); sessions.delete(id); inboxes[kind].clear(); lastClosed = kind; });
    prepareWindow(window);
    window.once('ready-to-show', () => { if (!window.isDestroyed()) { window.show(); window.focus(); } });
    loadWindow(window);
  } finally { creating.delete(kind); }
}
function route(request: LaunchFiles | null) {
  const kind = request?.workflow === 'convert' ? 'mini' : 'editor';
  if (request) inboxes[kind].enqueue(request);
  openWindow(kind);
}
if (ownsInstance && !shellCommand) {
  const initial = launchArguments(process.argv, process.cwd()); if (initial) route(initial);
  app.on('second-instance', (_event, argv, cwd) => route(launchArguments(argv, cwd)));
  app.on('open-file', (event, path) => { event.preventDefault(); route(launchArguments([process.execPath, '--', path], process.cwd())); });
}
app.whenReady().then(() => {
  if (!ownsInstance || configureSystemIntegration(shellCommand, trusted)) return;
  configureCompletionNotifications(trusted);
  stopWatchFolders = configureWatchFolders(trusted);
  protocol.handle('media', request => {
    const url = new URL(request.url), id = url.pathname.slice(1);
    for (const session of sessions.values()) {
      const path = session.path(url.hostname, id);
      if (path) return mediaResponse(path, request);
    }
    return new Response('Not found', { status: 404 });
  });
  ipcMain.on('media:cancel', event => {
    const session = sessions.get(event.sender.id);
    if (session && event.senderFrame === event.sender.mainFrame) session.jobs.cancel();
  });
  desktopReady = true;
  if (inboxes.mini.peek()) openWindow('mini');
  if (inboxes.editor.peek() || !windows.size) openWindow('editor');
  app.on('activate', () => { if (!windows.size) openWindow('editor'); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || lastClosed === 'mini') app.quit(); });
app.on('before-quit', () => { stopWatchFolders(); for (const session of sessions.values()) session.clear(); });
