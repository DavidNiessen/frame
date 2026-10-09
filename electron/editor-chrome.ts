import type { BrowserWindow, Rectangle } from 'electron';
import { desktopChromeSpace, type WindowState } from '../src/core/window-controls';
import { updateWindowOutline } from './window-outline';

export function editorBounds(work: Rectangle): Rectangle {
  const width = Math.min(1440, work.width), height = Math.min(960, work.height - desktopChromeSpace);
  return { x: Math.round(work.x + (work.width - width) / 2), y: Math.round(work.y + desktopChromeSpace + (work.height - desktopChromeSpace - height) / 2), width, height };
}

/** Add native space above the content in one operation, keeping its screen bounds fixed. */
export function configureEditorChrome(window: BrowserWindow) {
  let expanded = false, normalExpanded = false, changing = false;
  const [minWidth, minHeight] = window.getMinimumSize();
  const docked = () => window.isMaximized() || window.isFullScreen();
  const inset = () => docked() || normalExpanded ? desktopChromeSpace : 0;
  const state = (): WindowState => ({
    maximized: window.isMaximized(), fullscreen: window.isFullScreen(), focused: window.isFocused(),
    contentHeight: window.getContentBounds().height - inset(), chromeInset: inset(), chromeExpanded: expanded,
  });
  const notify = () => {
    if (changing || window.isDestroyed() || window.webContents.isDestroyed()) return;
    updateWindowOutline(window, inset(), expanded);
    window.webContents.send('desktop:window-state', state());
  };
  const resize = () => {
    if (docked() || normalExpanded === expanded) { notify(); return; }
    const bounds = window.getBounds(), delta = expanded ? desktopChromeSpace : -desktopChromeSpace;
    changing = true; normalExpanded = expanded;
    try {
      window.setMinimumSize(minWidth, minHeight + (expanded ? desktopChromeSpace : 0));
      window.setBounds({ ...bounds, y: bounds.y - delta, height: bounds.height + delta });
    } finally { changing = false; }
    notify();
  };
  const expand = (value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('Invalid title-bar state.');
    expanded = value; resize(); return state();
  };
  // Windows reports leaving fullscreen before applying its restored geometry.
  const restored = () => setImmediate(() => { if (!window.isDestroyed()) resize(); });
  window.on('resize', notify); window.on('focus', notify); window.on('blur', notify);
  window.on('maximize', notify); window.on('enter-full-screen', notify);
  window.on('unmaximize', restored); window.on('leave-full-screen', restored);
  notify();
  return { state, expand };
}
