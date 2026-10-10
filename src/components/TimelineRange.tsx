import { useContext, useRef, useState, type PointerEvent, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { TimelineSnapContext } from './TimelineSnapContext';
import { snapTime, type SnapSpace } from '../core/snapping';
import type { TimeRange } from '../core/types';
import type { Boundary } from '../core/timeline-edit';
import { time } from '../core/format';
import { X } from 'lucide-react';
interface Props {
  snapSpace?: SnapSpace; selectOnPointer?: boolean; text?: string; range: TimeRange; limits: TimeRange; duration: number; label: string; className?: string;
  disabled: boolean; onChange: (range: TimeRange) => void; onSelect: () => void;
  startLabel?: string; endLabel?: string; edges?: Boundary[]; minimum?: number;
  displayRange?: TimeRange; displaySpeed?: number; bodyProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  renderContent?: (range: TimeRange) => ReactNode;
  remove?: { label: string; run: () => void };
}
export function TimelineRange({ range, limits, duration, label, text, selectOnPointer = false, className = '', disabled, onChange, onSelect,
  startLabel = `${label} start`, endLabel = `${label} end`, edges = ['start', 'end'], minimum = 0.05, renderContent, displayRange, displaySpeed = 1, bodyProps, snapSpace = 'source', remove }: Props) {
  const snap = useContext(TimelineSnapContext);
  const [snapped, setSnapped] = useState(false);
  const [draft, setDraft] = useState<TimeRange | null>(null);
  const gesture = useRef<{ pointer: number; edge: Boundary; range: TimeRange; origin: number; width: number } | null>(null);
  const pending = useRef(range);
  const shown = draft ?? range;
  const positioned = displayRange ? { start: displayRange.start + (shown.start - range.start) / displaySpeed, end: displayRange.end + (shown.end - range.end) / displaySpeed } : shown;
  function constrain(edge: Boundary, value: number, base: TimeRange): TimeRange {
    const next = value;
    return edge === 'start' ? { ...base, start: Math.max(limits.start, Math.min(base.end - minimum, next)) }
      : { ...base, end: Math.min(limits.end, Math.max(base.start + minimum, next)) };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId || disabled) return;
    const raw = g.range[g.edge] + (event.clientX - g.origin) / g.width * duration * displaySpeed;
    const value = snap.enabled && !event.altKey ? snapTime(raw, snap.targets[snapSpace], 8 / g.width * duration * displaySpeed, snapSpace === 'source' ? snap.frameRate : undefined) : Math.round(raw * 100) / 100;
    setSnapped(Math.abs(value - raw) > .000001 && snap.enabled && !event.altKey);
    pending.current = constrain(g.edge, value, g.range);
    setDraft(pending.current);
  }
  function cancel() { gesture.current = null; setDraft(null); }
  return <div data-duration={duration} data-speed={displaySpeed} className={`timeline-range ${className} ${draft ? 'trimming' : ''} ${remove ? 'removable' : ''}`} style={{ left: `${positioned.start / duration * 100}%`, width: `${(positioned.end - positioned.start) / duration * 100}%` }}>
    <button className="range-body" disabled={disabled} {...bodyProps} onClick={event => { if (event.detail === 0 || selectOnPointer) onSelect(); }}
      onKeyDown={event => { bodyProps?.onKeyDown?.(event); if (!event.defaultPrevented && remove && ['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); remove.run(); } }}
      aria-label={label} title={`${label} · ${time(shown.start)}–${time(shown.end)}${remove ? ' · Delete to remove' : ''}`}><span>{text ?? label}</span></button>
    {renderContent?.(shown)}
    {remove && <button className="range-remove" aria-label={remove.label} title={remove.label} disabled={disabled} onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); remove.run(); }}><X size={12} /></button>}
    {edges.map(edge => <button key={edge} className={`range-handle ${edge}`} role="slider" aria-label={edge === 'start' ? startLabel : endLabel}
      aria-orientation="horizontal" aria-valuemin={edge === 'start' ? limits.start : shown.start + minimum}
      aria-valuemax={edge === 'start' ? shown.end - minimum : limits.end} aria-valuenow={shown[edge]}
      aria-valuetext={`${shown[edge].toFixed(2)} seconds`} disabled={disabled}
      onPointerDown={event => {
        event.stopPropagation(); if (disabled || event.button !== 0) return;
        const bounds = event.currentTarget.closest('.timeline-lane')!.getBoundingClientRect();
        if (!bounds.width) return;
        event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
        gesture.current = { pointer: event.pointerId, edge, range, origin: event.clientX, width: bounds.width };
        pending.current = range;
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => { event.stopPropagation(); move(event); }}
      onPointerUp={event => {
        event.stopPropagation(); if (gesture.current?.pointer !== event.pointerId) return;
        move(event); gesture.current = null;
        if (pending.current.start !== range.start || pending.current.end !== range.end) onChange(pending.current); setDraft(null); event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={cancel} onLostPointerCapture={cancel}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Escape') { cancel(); return; }
        const step = event.shiftKey ? 0.1 : 0.01;
        const next = event.key === 'Home' ? limits.start : event.key === 'End' ? limits.end
          : event.key === 'ArrowLeft' ? shown[edge] - step : event.key === 'ArrowRight' ? shown[edge] + step
          : event.key === 'PageDown' ? shown[edge] - 1 : event.key === 'PageUp' ? shown[edge] + 1 : null;
        if (next === null) return;
        event.preventDefault(); event.stopPropagation(); onChange(constrain(edge, Math.round(next * 100) / 100, range));
      }}><span aria-hidden="true" /></button>)}
    {draft && <output className="range-readout">{snapped ? 'Snapped · ' : ''}{shown.start.toFixed(2)}–{shown.end.toFixed(2)}s</output>}
  </div>;
}
