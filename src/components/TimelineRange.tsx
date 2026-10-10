import { useContext, useRef, useState, type PointerEvent, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { TimelineSnapContext } from './TimelineSnapContext';
import { snapTime, type SnapSpace } from '../core/snapping';
import type { TimeRange } from '../core/types';
import type { Boundary } from '../core/timeline-edit';
import { time } from '../core/format';
import { X } from 'lucide-react';
interface Props {
  snapSpace?: SnapSpace; selectOnPointer?: boolean; text?: string; range: TimeRange; limits: TimeRange; duration: number; label: string; className?: string;
  disabled: boolean; onChange: (range: TimeRange) => void; onSelect: (keepView?: boolean) => void;
  onMove?: (delta: number) => void; moveLimits?: TimeRange;
  onLimit?: (edge: Boundary) => void; startTitle?: string; endTitle?: string;
  wideHandles?: boolean;
  startLabel?: string; endLabel?: string; edges?: Boundary[]; minimum?: number;
  displayRange?: TimeRange; displaySpeed?: number; bodyProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  renderContent?: (range: TimeRange) => ReactNode;
  remove?: { label: string; run: () => void };
}
export function TimelineRange({ range, limits, duration, label, text, selectOnPointer = false, className = '', disabled, onChange, onSelect,
  startLabel = `${label} start`, endLabel = `${label} end`, edges = ['start', 'end'], minimum = 0.05, renderContent, displayRange, displaySpeed = 1, bodyProps, snapSpace = 'source', remove, onMove, moveLimits, onLimit, startTitle, endTitle, wideHandles = false }: Props) {
  const snap = useContext(TimelineSnapContext);
  const [snapped, setSnapped] = useState(false);
  const [draft, setDraft] = useState<TimeRange | null>(null);
  const gesture = useRef<{ pointer: number; edge: Boundary | 'body'; range: TimeRange; origin: number; width: number; moved: boolean; limit?: Boundary } | null>(null);
  const suppressClick = useRef(false);
  const pending = useRef(range);
  const shown = draft ?? range;
  const positioned = displayRange ? { start: displayRange.start + (shown.start - range.start) / displaySpeed, end: displayRange.end + (shown.end - range.end) / displaySpeed } : shown;
  const width = `${(positioned.end - positioned.start) / duration * 100}%`;
  const left = `${positioned.start / duration * 100}%`;
  function constrain(edge: Boundary, value: number, base: TimeRange): TimeRange {
    const next = value;
    return edge === 'start' ? { ...base, start: Math.max(limits.start, Math.min(base.end - minimum, next)) }
      : { ...base, end: Math.min(limits.end, Math.max(base.start + minimum, next)) };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId || disabled) return;
    const offset = (event.clientX - g.origin) / g.width * duration * displaySpeed;
    g.moved ||= Math.abs(event.clientX - g.origin) > 3;
    if (g.edge === 'body' && !g.moved) return;
    const raw = g.range[g.edge === 'body' ? 'start' : g.edge] + offset;
    // The boundary being dragged must not attract itself after every small move.
    const targets = snap.targets[snapSpace].filter(value => value !== g.range.start && value !== g.range.end);
    const value = snap.enabled && !event.altKey ? snapTime(raw, targets, 8 / g.width * duration * displaySpeed, snapSpace === 'source' ? snap.frameRate : undefined) : Math.round(raw * 100) / 100;
    g.limit = g.edge === 'start' && raw < limits.start ? 'start' : g.edge === 'end' && raw > limits.end ? 'end' : undefined;
    setSnapped(Math.abs(value - raw) > .000001 && snap.enabled && !event.altKey);
    if (g.edge === 'body') {
      const bounds = moveLimits ?? { start: limits.start - range.start, end: limits.end - range.end };
      const delta = Math.max(bounds.start, Math.min(bounds.end, value - g.range.start));
      pending.current = { start: g.range.start + delta, end: g.range.end + delta };
    } else pending.current = constrain(g.edge, value, g.range);
    setDraft(pending.current);
  }
  function cancel() { if (gesture.current) suppressClick.current = true; gesture.current = null; setDraft(null); }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation(); const g = gesture.current; if (!g || g.pointer !== event.pointerId) return;
    move(event); gesture.current = null; suppressClick.current = g.edge === 'body' && g.moved;
    if (pending.current.start !== range.start || pending.current.end !== range.end) {
      if (g.edge === 'body') onMove?.(pending.current.start - g.range.start); else onChange(pending.current);
    } else if (g.moved && g.limit) onLimit?.(g.limit);
    setDraft(null); event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div data-wide-handles={wideHandles || undefined} data-effect-timeline={selectOnPointer || undefined} data-duration={duration} data-speed={displaySpeed} className={`timeline-range ${className} ${draft ? 'trimming' : ''} ${remove ? 'removable' : ''} ${onMove ? 'movable-range' : ''}`} style={{ left: selectOnPointer || wideHandles ? `max(0px, min(${left}, calc(100% - max(var(--effect-hit-width, 48px), ${width}))))` : left, width }}>
    <button className="range-body" disabled={disabled} {...bodyProps} onClick={event => { if (!suppressClick.current && (event.detail === 0 || selectOnPointer)) onSelect(); }}
      onPointerDown={onMove ? event => {
        event.stopPropagation(); if (disabled || event.button !== 0) return;
        const bounds = event.currentTarget.closest('.timeline-lane')!.getBoundingClientRect(); if (!bounds.width) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); suppressClick.current = false;
        gesture.current = { pointer: event.pointerId, edge: 'body', range, origin: event.clientX, width: bounds.width, moved: false }; pending.current = range;
        event.currentTarget.setPointerCapture(event.pointerId); onSelect(true);
      } : bodyProps?.onPointerDown}
      onPointerMove={onMove ? move : bodyProps?.onPointerMove} onPointerUp={onMove ? finish : bodyProps?.onPointerUp} onPointerCancel={onMove ? cancel : bodyProps?.onPointerCancel} onLostPointerCapture={onMove ? cancel : bodyProps?.onLostPointerCapture}
      onKeyDown={event => {
        bodyProps?.onKeyDown?.(event);
        if (event.key === 'Escape') { cancel(); event.stopPropagation(); return; }
        if (!event.defaultPrevented && onMove && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation(); const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .1 : .01);
          const bounds = moveLimits ?? { start: limits.start - range.start, end: limits.end - range.end }; onSelect(true); onMove(Math.max(bounds.start, Math.min(bounds.end, delta)));
        }
        if (!event.defaultPrevented && remove && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); remove.run(); }
      }}
      aria-label={label} title={`${label} · ${time(shown.start)}–${time(shown.end)}${remove ? ' · Delete to remove' : ''}`}><span>{text ?? label}</span></button>
    {renderContent?.(shown)}
    {remove && <button className="range-remove" aria-label={remove.label} title={remove.label} disabled={disabled} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); remove.run(); }}><X size={12} /></button>}
    {edges.map(edge => <button key={edge} className={`range-handle ${edge}`} role="slider" aria-label={edge === 'start' ? startLabel : endLabel}
      title={edge === 'start' ? startTitle : endTitle}
      aria-orientation="horizontal" aria-valuemin={edge === 'start' ? limits.start : shown.start + minimum}
      aria-valuemax={edge === 'start' ? shown.end - minimum : limits.end} aria-valuenow={shown[edge]}
      aria-valuetext={`${shown[edge].toFixed(2)} seconds`} disabled={disabled}
      onPointerDown={event => {
        event.stopPropagation(); if (disabled || event.button !== 0) return;
        const bounds = event.currentTarget.closest('.timeline-lane')!.getBoundingClientRect();
        if (!bounds.width) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        gesture.current = { pointer: event.pointerId, edge, range, origin: event.clientX, width: bounds.width, moved: false };
        pending.current = range;
        event.currentTarget.setPointerCapture(event.pointerId); if (selectOnPointer) onSelect(true);
      }} onPointerMove={event => { event.stopPropagation(); move(event); }}
      onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Escape') { cancel(); event.stopPropagation(); return; }
        const step = event.shiftKey ? 0.1 : 0.01;
        const next = event.key === 'Home' ? limits.start : event.key === 'End' ? limits.end
          : event.key === 'ArrowLeft' ? shown[edge] - step : event.key === 'ArrowRight' ? shown[edge] + step
          : event.key === 'PageDown' ? shown[edge] - 1 : event.key === 'PageUp' ? shown[edge] + 1 : null;
        if (next === null) return;
        event.preventDefault(); event.stopPropagation(); if (selectOnPointer) onSelect(true); onChange(constrain(edge, Math.round(next * 100) / 100, range));
      }}><span aria-hidden="true" /></button>)}
    {draft && <output className="range-readout">{snapped ? 'Snapped · ' : ''}{shown.start.toFixed(2)}–{shown.end.toFixed(2)}s</output>}
  </div>;
}
