import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { desktopChromeSpace, type WindowState } from '../core/window-controls';
import { DesktopTitleBar } from './DesktopTitleBar';
import { DesktopChromeContext } from '../hooks/useDesktopChrome';

export function DesktopWindow({ children }: { children: ReactNode }) {
  const bridge = window.frameDesktop!;
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [state, setState] = useState<WindowState>({ maximized: false, fullscreen: false, focused: true, contentHeight: innerHeight - desktopChromeSpace, chromeInset: desktopChromeSpace, chromeExpanded: false });
  useEffect(() => {
    let active = true;
    const update = (next: WindowState) => { if (active) setState(next); };
    const unsubscribe = bridge.onWindowState(update);
    void bridge.windowState().then(update).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  const style = { '--desktop-chrome-height': `${desktopChromeSpace}px`, '--desktop-content-height': `${state.contentHeight}px`, '--app-height': `${state.contentHeight - 2}px` } as CSSProperties;
  return <div className="desktop-window" style={style}>
    <div className="desktop-window-frame" data-chrome-expanded={state.chromeExpanded}>
      <DesktopTitleBar state={state} pinned={previewFullscreen || state.fullscreen || state.maximized} />
      <div className="desktop-window-content"><DesktopChromeContext.Provider value={setPreviewFullscreen}>{children}</DesktopChromeContext.Provider></div>
    </div>
  </div>;
}
