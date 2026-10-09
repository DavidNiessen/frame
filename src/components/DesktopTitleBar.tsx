import { useEffect, useRef, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { desktopChromeSpace, type WindowAction, type WindowState } from '../core/window-controls';

export function DesktopTitleBar({ state }: { state: WindowState }) {
  const bridge = window.frameDesktop!;
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const bar = useRef<HTMLDivElement>(null), first = useRef<HTMLButtonElement>(null), previousFocus = useRef<HTMLElement | null>(null);
  const keyboardFocus = useRef(false);
  const pendingFocus = useRef(false);
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let nearTop = false;
    const clear = () => { clearTimeout(hideTimer); hideTimer = undefined; };
    const hide = () => {
      clear();
      if (!keyboardFocus.current || !bar.current?.contains(document.activeElement)) setVisible(false);
    };
    const move = (event: PointerEvent) => {
      nearTop = event.clientY <= desktopChromeSpace + 8;
      if (event.clientY >= state.chromeInset && event.clientY <= state.chromeInset + 8) { clear(); setVisible(true); }
      else if (nearTop) clear();
      else if (!hideTimer) hideTimer = setTimeout(() => { hideTimer = undefined; hide(); }, 180);
    };
    const leave = (event: PointerEvent) => {
      // Native drag/resize regions can report a pointer exit while still inside the top edge.
      if (!event.relatedTarget && !(event.clientY >= 0 && event.clientY <= desktopChromeSpace + 8 && event.clientX >= 0 && event.clientX < innerWidth)) { nearTop = false; hide(); }
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
        pendingFocus.current = true; setVisible(true); clear();
        if (state.chromeExpanded) { pendingFocus.current = false; first.current?.focus(); }
      } else if (event.key === 'Escape' && bar.current?.contains(document.activeElement)) {
        event.preventDefault(); event.stopImmediatePropagation();
        (document.activeElement as HTMLElement).blur(); previousFocus.current?.focus(); setVisible(false);
      }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerout', leave);
    window.addEventListener('pointerdown', pointerDown);
    window.addEventListener('blur', blur); window.addEventListener('keydown', key, true);
    const element = bar.current; element?.addEventListener('focusout', focusOut);
    return () => {
      clear(); element?.removeEventListener('focusout', focusOut);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leave);
      window.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('blur', blur); window.removeEventListener('keydown', key, true);
    };
  }, [bridge, state.chromeInset, state.chromeExpanded]);
  useEffect(() => {
    const update = () => { void bridge.setWindowChrome(visible).catch(() => setError('Could not resize the title bar. Please try again.')); };
    if (visible) { update(); return; }
    const timer = setTimeout(update, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280);
    return () => clearTimeout(timer);
  }, [bridge, visible]);
  const act = (action: WindowAction) => { setError(''); void bridge.windowAction(action).catch(() => { setError('Window action failed. Please try again.'); setVisible(true); }); };
  const restore = state.maximized || state.fullscreen;
  const revealed = visible && state.chromeExpanded;
  useEffect(() => {
    if (!revealed || !pendingFocus.current) return;
    pendingFocus.current = false;
    const frame = requestAnimationFrame(() => first.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [revealed]);
  return <div className="desktop-chrome" data-visible={revealed} data-focused={state.focused}>
    <div className="desktop-chrome-trigger" onPointerEnter={() => setVisible(true)} aria-hidden="true" />
    <div ref={bar} className="desktop-titlebar" role="toolbar" aria-label="Window controls" aria-hidden={!revealed}>
      <div className="desktop-titlebar-drag" aria-hidden="true" />
      {error && <span className="desktop-titlebar-error" role="alert">{error}</span>}
      <div className="desktop-window-buttons">
        <button ref={first} type="button" tabIndex={revealed ? 0 : -1} aria-label="Minimize window" title="Minimize" onClick={() => act('minimize')}><Minus size={17} /></button>
        <button type="button" tabIndex={revealed ? 0 : -1} aria-label={restore ? 'Restore window' : 'Maximize window'} title={restore ? 'Restore' : 'Maximize'} onClick={() => act('toggle-maximize')}>
          {restore ? <Copy size={15} /> : <Square size={15} />}
        </button>
        <button type="button" tabIndex={revealed ? 0 : -1} className="desktop-window-close" aria-label="Close window" title="Close" onClick={() => act('close')}><X size={18} /></button>
      </div>
    </div>
  </div>;
}
