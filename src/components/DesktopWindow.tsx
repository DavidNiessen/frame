import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { desktopChromeSpace, type WindowState } from '../core/window-controls';
import { DesktopTitleBar } from './DesktopTitleBar';

export function DesktopWindow({ children }: { children: ReactNode }) {
  const bridge = window.frameDesktop!;
  const [state, setState] = useState<WindowState>({ maximized: false, fullscreen: false, focused: true, contentHeight: innerHeight - desktopChromeSpace, chromeInset: desktopChromeSpace, chromeExpanded: false });
  useEffect(() => {
    let active = true;
    const update = (next: WindowState) => { if (active) setState(next); };
    const unsubscribe = bridge.onWindowState(update);
    void bridge.windowState().then(update).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  const style = { '--desktop-content-height': `${state.contentHeight}px`, '--app-height': `${state.contentHeight - 2}px` } as CSSProperties;
  return <div className="desktop-window" style={style}>
    <div className="desktop-window-frame" data-chrome-expanded={state.chromeExpanded}>
      <DesktopTitleBar state={state} />
      <div className="desktop-window-content">{children}</div>
    </div>
  </div>;
}
