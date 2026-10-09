import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { WindowState } from '../core/window-controls';
import { DesktopTitleBar } from './DesktopTitleBar';

export function DesktopWindow({ children }: { children: ReactNode }) {
  const bridge = window.frameDesktop!;
  const [state, setState] = useState<WindowState>({ maximized: false, fullscreen: false, focused: true, contentHeight: innerHeight, chromeInset: 0, chromeExpanded: false });
  useEffect(() => {
    let active = true;
    const update = (next: WindowState) => { if (active) setState(next); };
    const unsubscribe = bridge.onWindowState(update);
    void bridge.windowState().then(update).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [bridge]);
  const style = { '--desktop-content-height': `${state.contentHeight}px`, '--app-height': `${state.contentHeight - 2}px` } as CSSProperties;
  return <div className="desktop-window" style={style}>
    <div className="desktop-window-frame"><div className="desktop-window-content">{children}</div></div>
    <DesktopTitleBar state={state} />
  </div>;
}
