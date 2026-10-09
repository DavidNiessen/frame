import { app, dialog, Menu } from 'electron';
import { join } from 'node:path';
import { installShellActions } from './shell-actions';

export function shellStartupCommand(argv: string[]) {
  const end = argv.indexOf('--');
  const args = argv.slice(1, end < 0 ? undefined : end);
  return args.includes('--install-shell-actions') ? 'install' : args.includes('--remove-shell-actions') ? 'remove' : null;
}
export function configureSystemIntegration(command: 'install' | 'remove' | null): boolean {
  const location = { platform: process.platform, home: app.getPath('home'), dataHome: process.env.XDG_DATA_HOME, resources: process.resourcesPath, executable: process.env.APPIMAGE || process.execPath };
  const integrate = (remove: boolean) => {
    if (!app.isPackaged) return Promise.reject(new Error('Install the packaged Frame application before adding file-manager actions.'));
    return installShellActions(location, remove);
  };
  if (command) {
    let code = 0;
    void integrate(command === 'remove').then(message => console.info(message)).catch(error => { console.error(error.message); code = 1; }).finally(() => app.exit(code));
    return true;
  }
  if (process.platform === 'darwin') {
    const show = async (remove: boolean) => {
      try { await dialog.showMessageBox({ type: 'info', title: 'Finder Quick Actions', message: await integrate(remove) }); }
      catch (error) { await dialog.showMessageBox({ type: 'error', title: 'Finder Quick Actions', message: error instanceof Error ? error.message : String(error) }); }
    };
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Frame', submenu: [{ role: 'about' }, { type: 'separator' },
        { label: 'Install Finder Quick Actions…', enabled: app.isPackaged, click: () => void show(false) },
        { label: 'Remove Finder Quick Actions…', enabled: app.isPackaged, click: () => void show(true) },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' }, { role: 'windowMenu' },
    ]));
  }
  return false;
}
