import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { expect, it, vi } from 'vitest';
import { configureEditorChrome } from '../electron/editor-chrome';
import { configureWindowControls } from '../electron/window-controls';
import type { WindowIpc } from '../electron/window-ipc';
function nativeWindow() {
  return Object.assign(new EventEmitter(), {
    isFullScreen: () => false, isMaximized: () => false, isFocused: () => true, isDestroyed: () => false,
    getContentBounds: () => ({ x: 0, y: 0, width: 1440, height: 960 }),
    setFullScreen: vi.fn(), maximize: vi.fn(), unmaximize: vi.fn(),
    webContents: { isDestroyed: () => false, send: vi.fn() },
  });
}
it('pins controls through Windows fullscreen events even when the transparent window reports false', () => {
  const window = nativeWindow(), chrome = configureEditorChrome(window as unknown as BrowserWindow);
  window.emit('enter-full-screen');
  expect(chrome.state()).toMatchObject({ fullscreen: true, chromeExpanded: true });
  window.emit('resize'); window.emit('blur');
  expect(chrome.expand(false)).toMatchObject({ fullscreen: true, chromeExpanded: true });
  window.emit('leave-full-screen');
  expect(chrome.state()).toMatchObject({ fullscreen: false, chromeExpanded: false });
  expect(window.webContents.send).toHaveBeenLastCalledWith('desktop:window-state', expect.objectContaining({ fullscreen: false }));
});
it('restores a transparent fullscreen window instead of maximizing it', () => {
  const window = nativeWindow(), handlers = new Map<string, (...args: unknown[]) => unknown>();
  const ipc = { handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler) };
  configureWindowControls(window as unknown as BrowserWindow, ipc as unknown as WindowIpc);
  window.emit('enter-full-screen'); handlers.get('desktop:window-action')!(null, 'toggle-maximize');
  expect(window.setFullScreen).toHaveBeenCalledWith(false);
  expect(window.maximize).not.toHaveBeenCalled();
});
