import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { resizeFactor, type Corner, type Box } from '../core/frame-object';
import { FrameTextEditor } from './FrameTextEditor';
export interface FrameBounds { frame: Box; object: Box }
interface Props<T> {
  value: T; className?: string; label: string; text?: string; children?: ReactNode; disabled: boolean; movable?: boolean; selected: boolean;
  style: (value: T) => CSSProperties; positionClass?: (value: T) => string; select: () => void; pause: () => void; commit: (value: T) => void;
  move: (base: T, dx: number, dy: number, bounds: FrameBounds) => T;
  resize: (base: T, factor: number, corner: Corner, bounds: FrameBounds) => T;
  saveText?: (text: string) => void;
}
/** Shared hit testing and one undo entry per preview gesture. */
export function FrameObject<T>({ value, className = '', label, text, children, disabled, movable = true, selected, style, positionClass, select, pause, commit, move, resize, saveText }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null), suppressClick = useRef(false);
  const gesture = useRef<{ pointer: number; x: number; y: number; base: T; next: T; bounds: FrameBounds; corner?: Corner; moved: boolean } | null>(null);
  const [draft, setDraft] = useState<T | null>(null), [editing, setEditing] = useState<number | null>(null);
  const shown = draft ?? value, positioned = positionClass?.(shown) ?? '';
  function cancel() { if (gesture.current) suppressClick.current = true; gesture.current = null; setDraft(null); }
  useEffect(() => { cancel(); if (disabled) setEditing(null); }, [value, disabled]);
  function bounds(): FrameBounds {
    const box = (rect: DOMRect): Box => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    return { object: box(ref.current!.getBoundingClientRect()), frame: box(ref.current!.closest('[data-frame-area]')!.getBoundingClientRect()) };
  }
  function start(event: PointerEvent<HTMLButtonElement>, corner?: Corner) {
    if (disabled || event.button !== 0 || !event.isPrimary || editing !== null) return;
    suppressClick.current = false; event.stopPropagation(); pause();
    if (!movable) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, base: value, next: value, bounds: bounds(), corner, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drag(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current; if (!g || g.pointer !== event.pointerId || disabled) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    g.moved ||= Math.hypot(dx, dy) > 3; if (!g.moved) return;
    g.next = g.corner ? resize(g.base, resizeFactor(g.bounds.object, g.bounds.frame, g.corner, dx, dy), g.corner, g.bounds) : move(g.base, dx, dy, g.bounds);
    setDraft(g.next);
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current; if (!g || g.pointer !== event.pointerId) return;
    drag(event); gesture.current = null; suppressClick.current = g.moved;
    if (g.moved && !disabled) commit(g.next); setDraft(null);
  }
  const events = { onPointerMove: drag, onPointerUp: finish, onPointerCancel: cancel, onLostPointerCapture: cancel };
  return <div ref={ref} data-frame-object className={`frame-object ${className} ${positioned} ${selected ? 'selected' : ''} ${draft ? 'dragging' : ''}`} style={style(shown)}>
    {editing !== null && saveText ? <FrameTextEditor text={text ?? ''} label={`Edit ${label}${label.endsWith(' text') ? '' : ' text'} in preview`} width={editing} save={text => { saveText(text); setEditing(null); }} cancel={() => setEditing(null)} /> :
      <button className={`frame-object-content ${positioned}`} aria-label={label} disabled={disabled} title="Click for settings · double-click text to edit · drag to move"
        onPointerDown={event => start(event)} {...events} onClick={event => { event.stopPropagation(); if (!suppressClick.current) { pause(); select(); } }}
        onDoubleClick={event => { event.stopPropagation(); if (saveText && !suppressClick.current) { pause(); setEditing(ref.current!.getBoundingClientRect().width); } }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); return; }
          if (event.key === 'F2' && saveText) { event.preventDefault(); pause(); select(); setEditing(ref.current!.getBoundingClientRect().width); return; }
          if (!movable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation(); pause(); const b = bounds(), step = event.shiftKey ? .05 : .01;
          commit(move(value, (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0) * b.frame.width, (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) * b.frame.height, b));
        }}>{children ?? (text || 'Empty text')}</button>}
    {!disabled && movable && editing === null && (['nw', 'ne', 'sw', 'se'] as Corner[]).map(corner => <button key={corner} className={`frame-resize ${corner}`} aria-label={`Resize ${label} ${corner}`} title="Drag to resize" onPointerDown={event => start(event, corner)} {...events}
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); }
        if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); pause(); commit(resize(value, ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1.05 : 1 / 1.05, corner, bounds())); }
      }} />)}
  </div>;
}
