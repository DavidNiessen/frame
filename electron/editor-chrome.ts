import type { BrowserWindow, Rectangle } from 'electron';
import { desktopChromeSpace, type WindowState } from '../src/core/window-controls';

export function editorBounds(work: Rectangle): Rectangle {
  const width = Math.min(1440, work.width - 32),
    height = Math.min(960 + desktopChromeSpace, work.height);
  return {
    x: Math.round(work.x + (work.width - width) / 2),
    y: Math.round(work.y + (work.height - height) / 2),
    width,
    height,
  };
}

/** Reserve transparent headroom once; hover only changes paint, never native geometry. */
export function configureEditorChrome(window: BrowserWindow) {
  let expanded = false,
    fullscreen = window.isFullScreen();
  const state = (): WindowState => {
    const maximized = window.isMaximized();
    return {
      maximized,
      fullscreen,
      focused: window.isFocused(),
      contentHeight: window.getContentBounds().height - desktopChromeSpace,
      chromeInset: desktopChromeSpace,
      // Native state takes precedence over late hover/blur requests from the renderer.
      chromeExpanded: expanded || maximized || fullscreen,
    };
  };
  const notify = () => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send('desktop:window-state', state());
  };
  const expand = (value: unknown) => {
    if (typeof value !== 'boolean') throw new Error('Invalid title-bar state.');
    expanded = value;
    notify();
    return state();
  };
  // macOS can finish updating zoom geometry after its resize notification.
  // Refresh once more after the native callback completes, including setBounds.
  window.on('resize', () => {
    notify();
    setImmediate(notify);
  });
  window.on('focus', notify);
  window.on('blur', notify);
  window.on('maximize', notify);
  // Transparent Windows windows emit fullscreen events but isFullScreen() remains false.
  window.on('enter-full-screen', () => {
    fullscreen = true;
    notify();
  });
  window.on('unmaximize', notify);
  window.on('leave-full-screen', () => {
    fullscreen = false;
    notify();
  });
  notify();
  return { state, expand };
}
