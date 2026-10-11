import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  desktopChromeSpace,
  nativeMacChromeSpace,
  type WindowState,
} from '../core/window-controls';
import { DesktopTitleBar } from './DesktopTitleBar';
import { DesktopChromeContext } from '../hooks/useDesktopChrome';

export function DesktopWindow({ children }: { children: ReactNode }) {
  const bridge = window.frameDesktop!;
  const nativeControls = !!bridge.nativeWindowControls;
  const chromeSpace = nativeControls ? nativeMacChromeSpace : desktopChromeSpace;
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [state, setState] = useState<WindowState>({
    maximized: false,
    fullscreen: false,
    focused: true,
    contentHeight: innerHeight - chromeSpace,
    chromeInset: nativeControls ? 0 : desktopChromeSpace,
    chromeExpanded: nativeControls,
  });
  useEffect(() => {
    let active = true;
    const update = (next: WindowState) => {
      if (active) setState(next);
    };
    const unsubscribe = bridge.onWindowState(update);
    void bridge
      .windowState()
      .then(update)
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);
  const style = {
    '--desktop-chrome-height': `${chromeSpace}px`,
    '--desktop-content-height': `${state.contentHeight}px`,
    '--app-height': `${state.contentHeight - 2}px`,
  } as CSSProperties;
  return (
    <div className="desktop-window" style={style}>
      <div
        className="desktop-window-frame"
        data-native-controls={nativeControls}
        data-chrome-expanded={state.chromeExpanded}
        data-fullscreen={state.fullscreen}
        data-maximized={state.maximized}
      >
        {nativeControls ? (
          <div className="desktop-native-titlebar" aria-hidden="true" />
        ) : (
          <DesktopTitleBar
            state={state}
            pinned={previewFullscreen || state.fullscreen || state.maximized}
          />
        )}
        <div className="desktop-window-content">
          <DesktopChromeContext.Provider value={setPreviewFullscreen}>
            {children}
          </DesktopChromeContext.Provider>
        </div>
      </div>
    </div>
  );
}
