import { useEffect, useRef, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import type { WindowAction, WindowState } from '../core/window-controls';

export function DesktopTitleBar() {
  const bridge = window.frameDesktop!;
  const [visible, setVisible] = useState(false), [state, setState] = useState<WindowState>({ maximized: false, fullscreen: false, focused: true });
  const [error, setError] = useState('');
  const bar = useRef<HTMLDivElement>(null), first = useRef<HTMLButtonElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  const keyboardFocus = useRef(false);
  useEffect(() => {
    let active = true, hideTimer: ReturnType<typeof setTimeout> | undefined;
    let nearTop = false;
    const clear = () => { clearTimeout(hideTimer); hideTimer = undefined; };
    const hide = () => {
      clear();
      if (!keyboardFocus.current || !bar.current?.contains(document.activeElement)) setVisible(false);
    };
    const move = (event: PointerEvent) => {
      nearTop = event.clientY <= 58;
      if (event.clientY <= 8) { clear(); setVisible(true); }
      else if (nearTop) clear();
      else if (!hideTimer) hideTimer = setTimeout(() => { hideTimer = undefined; hide(); }, 180);
    };
    const leave = (event: PointerEvent) => {
      // Native drag/resize regions can report a pointer exit while still inside the top edge.
      if (!event.relatedTarget && !(event.clientY >= 0 && event.clientY <= 58 && event.clientX >= 0 && event.clientX < innerWidth)) { nearTop = false; hide(); }
    };
    const blur = () => { clear(); setVisible(false); };
    const pointerDown = () => { keyboardFocus.current = false; };
    const focusOut = () => { if (!nearTop) { clear(); hideTimer = setTimeout(() => { hideTimer = undefined; hide(); }, 180); } };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Tab') keyboardFocus.current = true;
      if (event.code === 'Space' && ((event.ctrlKey && event.shiftKey) || event.altKey)) {
        event.preventDefault(); event.stopImmediatePropagation();
        keyboardFocus.current = true;
        if (!bar.current?.contains(document.activeElement)) previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setVisible(true); clear(); requestAnimationFrame(() => first.current?.focus());
      } else if (event.key === 'Escape' && bar.current?.contains(document.activeElement)) {
        event.preventDefault(); event.stopImmediatePropagation();
        (document.activeElement as HTMLElement).blur(); previousFocus.current?.focus(); setVisible(false);
      }
    };
    const unsubscribe = bridge.onWindowState(next => { if (active) setState(next); });
    void bridge.windowState().then(next => { if (active) setState(next); }).catch(() => {});
    window.addEventListener('pointermove', move); window.addEventListener('pointerout', leave);
    window.addEventListener('pointerdown', pointerDown);
    window.addEventListener('blur', blur); window.addEventListener('keydown', key, true);
    const element = bar.current; element?.addEventListener('focusout', focusOut);
    return () => {
      active = false; clear(); unsubscribe(); element?.removeEventListener('focusout', focusOut);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leave);
      window.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('blur', blur); window.removeEventListener('keydown', key, true);
    };
  }, [bridge]);
  const act = (action: WindowAction) => { setError(''); void bridge.windowAction(action).catch(() => { setError('Window action failed. Please try again.'); setVisible(true); }); };
  const restore = state.maximized || state.fullscreen;
  return <div className="desktop-chrome" data-visible={visible} data-focused={state.focused}>
    <div className="desktop-chrome-trigger" onPointerEnter={() => setVisible(true)} aria-hidden="true" />
    <div ref={bar} className="desktop-titlebar" role="toolbar" aria-label="Window controls" aria-hidden={!visible}>
      <div className="desktop-titlebar-drag" aria-hidden="true" />
      {error && <span className="desktop-titlebar-error" role="alert">{error}</span>}
      <div className="desktop-window-buttons">
        <button ref={first} type="button" tabIndex={visible ? 0 : -1} aria-label="Minimize window" title="Minimize" onClick={() => act('minimize')}><Minus size={17} /></button>
        <button type="button" tabIndex={visible ? 0 : -1} aria-label={restore ? 'Restore window' : 'Maximize window'} title={restore ? 'Restore' : 'Maximize'} onClick={() => act('toggle-maximize')}>
          {restore ? <Copy size={15} /> : <Square size={15} />}
        </button>
        <button type="button" tabIndex={visible ? 0 : -1} className="desktop-window-close" aria-label="Close window" title="Close" onClick={() => act('close')}><X size={18} /></button>
      </div>
    </div>
  </div>;
}
