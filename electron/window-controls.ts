import type { BrowserWindow } from 'electron';
import type { WindowIpc } from './window-ipc';
import type { WindowState } from '../src/core/window-controls';

/** Editor-only channels: the mini converter cannot control the main window. */
export function configureWindowControls(window: BrowserWindow, ipc: WindowIpc) {
  const state = (): WindowState => ({ maximized: window.isMaximized(), fullscreen: window.isFullScreen(), focused: window.isFocused() });
  const notify = () => { if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('desktop:window-state', state()); };
  ipc.handle('desktop:window-state', state);
  ipc.handle('desktop:window-action', (_event, action: unknown) => {
    switch (action) {
      case 'minimize': window.minimize(); break;
      case 'toggle-maximize':
        if (window.isFullScreen()) window.setFullScreen(false);
        else if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        break;
      case 'close': window.close(); break;
      default: throw new Error('Unknown window action.');
    }
  });
  window.on('maximize', notify); window.on('unmaximize', notify);
  window.on('enter-full-screen', notify); window.on('leave-full-screen', notify);
  window.on('focus', notify); window.on('blur', notify);
}
