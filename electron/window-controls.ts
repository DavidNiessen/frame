import type { BrowserWindow } from 'electron';
import type { WindowIpc } from './window-ipc';
import { configureEditorChrome } from './editor-chrome';

/** Editor-only channels: the mini converter cannot control the main window. */
export function configureWindowControls(window: BrowserWindow, ipc: WindowIpc) {
  const chrome = configureEditorChrome(window);
  ipc.handle('desktop:window-state', chrome.state);
  ipc.handle('desktop:window-chrome', (_event, value: unknown) => chrome.expand(value));
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
}
