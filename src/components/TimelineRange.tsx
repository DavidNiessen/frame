import { useRef, useState, type PointerEvent, type ReactNode } from 'react';
import type { TimeRange } from '../core/types';
import type { Boundary } from '../core/timeline-edit';
import { time } from '../core/format';
interface Props {
  selectOnPointer?: boolean; text?: string; range: TimeRange; limits: TimeRange; duration: number; label: string; className?: string;
  disabled: boolean; onChange: (range: TimeRange) => void; onSelect: () => void;
  startLabel?: string; endLabel?: string; edges?: Boundary[]; minimum?: number;
  renderContent?: (range: TimeRange) => ReactNode;
}
export function TimelineRange({ range, limits, duration, label, text, selectOnPointer = false, className = '', disabled, onChange, onSelect,
  startLabel = `${label} start`, endLabel = `${label} end`, edges = ['start', 'end'], minimum = 0.05, renderContent }: Props) {
  const [draft, setDraft] = useState<TimeRange | null>(null);
  const gesture = useRef<{ pointer: number; edge: Boundary; range: TimeRange; origin: number; width: number } | null>(null);
  const pending = useRef(range);
  const shown = draft ?? range;
  function constrain(edge: Boundary, value: number, base: TimeRange): TimeRange {
    const next = Math.round(value * 100) / 100;
    return edge === 'start' ? { ...base, start: Math.max(limits.start, Math.min(base.end - minimum, next)) }
      : { ...base, end: Math.min(limits.end, Math.max(base.start + minimum, next)) };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId || disabled) return;
    pending.current = constrain(g.edge, g.range[g.edge] + (event.clientX - g.origin) / g.width * duration, g.range);
    setDraft(pending.current);
  }
  function cancel() { gesture.current = null; setDraft(null); }
  return <div className={`timeline-range ${className}`} style={{ left: `${shown.start / duration * 100}%`, width: `${(shown.end - shown.start) / duration * 100}%` }}>
    <button className="range-body" disabled={disabled} onClick={event => { if (event.detail === 0 || selectOnPointer) onSelect(); }} aria-label={label} title={`${label} · ${time(shown.start)}–${time(shown.end)}`}><span>{text ?? label}</span></button>
    {renderContent?.(shown)}
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
        event.preventDefault(); event.stopPropagation(); onChange(constrain(edge, next, range));
      }}><span aria-hidden="true" /></button>)}
    {draft && <output className="range-readout">{shown.start.toFixed(2)}–{shown.end.toFixed(2)}s</output>}
  </div>;
}
