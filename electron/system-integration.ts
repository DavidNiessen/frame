import { app, dialog, Menu, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { installShellActions, shellActionState } from './shell-actions';
import { windowsShellStatus } from './windows-shell-integration';
import type { ShellIntegrationStatus } from '../src/core/system-integration';

export function shellStartupCommand(argv: string[]) {
  const end = argv.indexOf('--');
  const args = argv.slice(1, end < 0 ? undefined : end);
  return args.includes('--install-shell-actions') ? 'install' : args.includes('--remove-shell-actions') ? 'remove' : null;
}
export function configureSystemIntegration(command: 'install' | 'remove' | null, trusted: (event: IpcMainInvokeEvent) => void): boolean {
  const location = { platform: process.platform, home: app.getPath('home'), dataHome: process.env.XDG_DATA_HOME, resources: process.resourcesPath, executable: app.isPackaged ? process.env.APPIMAGE || process.execPath : process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] };
  let changing = false;
  const integrate = async (remove: boolean) => {
    if (changing) throw new Error('A file-manager integration change is already running.');
    changing = true;
    try { return await installShellActions(location, remove); } finally { changing = false; }
  };
  if (command) {
    let code = 0;
    void integrate(command === 'remove').then(message => console.info(message)).catch(error => { console.error(error.message); code = 1; }).finally(() => app.exit(code));
    return true;
  }
  const status = async (): Promise<ShellIntegrationStatus> => {
    const supported = ['win32', 'darwin', 'linux'].includes(process.platform);
    const available = supported;
    const windows = process.platform === 'win32' ? await windowsShellStatus(location) : undefined;
    return { platform: process.platform, available, state: windows?.state ?? (available ? await shellActionState(location) : 'not-installed'),
      detail: !supported ? 'File-manager actions are not available on this operating system.' : (windows?.detail ?? (process.platform === 'darwin' ? 'In Finder, look under Quick Actions or Services. If hidden, enable Frame in System Settings → Keyboard → Keyboard Shortcuts → Services.' : 'Available in KDE Dolphin. Restart Dolphin after changing these actions.')) + (!app.isPackaged ? ' These actions open this development checkout. Reinstall them if you move the project.' : '') };
  };
  ipcMain.handle('desktop:shell-status', event => { trusted(event); return status(); });
  ipcMain.handle('desktop:set-shell-actions', async (event, enabled: unknown) => {
    trusted(event);
    if (typeof enabled !== 'boolean') throw new Error('Invalid integration setting.');
    await integrate(!enabled);
    return status();
  });
  if (process.platform === 'darwin') {
    const show = async (remove: boolean) => {
      try { await dialog.showMessageBox({ type: 'info', title: 'Finder Quick Actions', message: await integrate(remove) }); }
      catch (error) { await dialog.showMessageBox({ type: 'error', title: 'Finder Quick Actions', message: error instanceof Error ? error.message : String(error) }); }
    };
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Frame', submenu: [{ role: 'about' }, { type: 'separator' },
        { label: 'Install Finder Quick Actions…', click: () => void show(false) },
        { label: 'Remove Finder Quick Actions…', click: () => void show(true) },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' }, { role: 'windowMenu' },
    ]));
  }
  return false;
}
