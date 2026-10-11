import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
import { TimelineSnapContext } from './TimelineSnapContext';
import { snapTime, type SnapSpace } from '../core/snapping';
import type { TimeRange } from '../core/types';
import type { Boundary } from '../core/timeline-edit';
import { time } from '../core/format';
import { TimelineMenuContext, type TimelineMenuTarget } from './TimelineMenuContext';
import type { TimelineClipboard } from '../core/timeline-clipboard';
interface Props {
  clipboard?: TimelineClipboard;
  contextClipId?: string;
  snapSpace?: SnapSpace;
  selectOnPointer?: boolean;
  text?: string;
  range: TimeRange;
  limits: TimeRange;
  duration: number;
  label: string;
  className?: string;
  snapMap?: (targets: number[]) => number[];
  disabled: boolean;
  onChange: (range: TimeRange) => void;
  onSelect: (keepView?: boolean) => void;
  onMove?: (delta: number) => void;
  moveLimits?: TimeRange;
  onPreview?: (range: TimeRange, edge: Boundary | 'body') => void;
  startTitle?: string;
  endTitle?: string;
  wideHandles?: boolean;
  edgeLimits?: Partial<Record<Boundary, TimeRange>>;
  startLabel?: string;
  endLabel?: string;
  edges?: Boundary[];
  minimum?: number;
  displayRange?: TimeRange;
  displaySpeed?: number;
  bodyProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  renderContent?: (range: TimeRange) => ReactNode;
  remove?: { label: string; run: () => void };
}
export function TimelineRange({
  range,
  limits,
  duration,
  label,
  text,
  selectOnPointer = false,
  className = '',
  disabled,
  onChange,
  onSelect,
  startLabel = `${label} start`,
  endLabel = `${label} end`,
  edges = ['start', 'end'],
  minimum = 0.05,
  renderContent,
  displayRange,
  displaySpeed = 1,
  bodyProps,
  snapSpace = 'source',
  snapMap,
  remove,
  onMove,
  moveLimits,
  onPreview,
  startTitle,
  endTitle,
  wideHandles = false,
  edgeLimits,
  clipboard,
  contextClipId,
}: Props) {
  const element = useRef<HTMLDivElement>(null);
  const snap = useContext(TimelineSnapContext),
    menu = useContext(TimelineMenuContext);
  const target: TimelineMenuTarget = {
    label,
    range,
    shown: displayRange ?? range,
    limits,
    speed: displaySpeed,
    minimum,
    edges,
    clipId: contextClipId,
    clipboard,
    select: onSelect,
    change: onChange,
    move: onMove,
    moveLimits,
    preview: onPreview,
    remove: remove?.run,
  };
  useLayoutEffect(() => {
    if (element.current?.contains(document.activeElement)) menu?.focus(target);
  });
  const [snapped, setSnapped] = useState(false);
  const [draft, setDraft] = useState<TimeRange | null>(null);
  const gesture = useRef<{
    pointer: number;
    edge: Boundary | 'body';
    range: TimeRange;
    origin: number;
    width: number;
    moved: boolean;
    targets: number[];
  } | null>(null);
  const suppressClick = useRef(false);
  const pending = useRef(range);
  const shown = draft ?? range;
  const positioned = displayRange
    ? {
        start: displayRange.start + (shown.start - range.start) / displaySpeed,
        end: displayRange.end + (shown.end - range.end) / displaySpeed,
      }
    : shown;
  const width = `${((positioned.end - positioned.start) / duration) * 100}%`;
  const left = `${(positioned.start / duration) * 100}%`;
  function constrain(edge: Boundary, value: number, base: TimeRange): TimeRange {
    const next = value;
    const bounds = edgeLimits?.[edge];
    return edge === 'start'
      ? {
          ...base,
          start: Math.max(
            bounds?.start ?? limits.start,
            Math.min(bounds?.end ?? base.end - minimum, next),
          ),
        }
      : {
          ...base,
          end: Math.min(
            bounds?.end ?? limits.end,
            Math.max(bounds?.start ?? base.start + minimum, next),
          ),
        };
  }
  function gestureTargets() {
    const values = snapMap ? snapMap(snap.targets[snapSpace]) : snap.targets[snapSpace];
    return values.filter(
      (value) => Math.abs(value - range.start) > 0.000001 && Math.abs(value - range.end) > 0.000001,
    );
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId || disabled) return;
    const offset = ((event.clientX - g.origin) / g.width) * duration * displaySpeed;
    g.moved ||= Math.abs(event.clientX - g.origin) > 3;
    if (g.edge === 'body' && !g.moved) return;
    const raw = g.range[g.edge === 'body' ? 'start' : g.edge] + offset;
    // Keep landmarks stable while the preview playhead follows the gesture.
    const value =
      snap.enabled && !event.altKey
        ? snapTime(
            raw,
            g.targets,
            (8 / g.width) * duration * displaySpeed,
            snapSpace === 'source' ? snap.frameRate : undefined,
          )
        : Math.round(raw * 100) / 100;
    setSnapped(Math.abs(value - raw) > 0.000001 && snap.enabled && !event.altKey);
    if (g.edge === 'body') {
      const bounds = moveLimits ?? {
        start: limits.start - range.start,
        end: limits.end - range.end,
      };
      const delta = Math.max(bounds.start, Math.min(bounds.end, value - g.range.start));
      pending.current = { start: g.range.start + delta, end: g.range.end + delta };
    } else pending.current = constrain(g.edge, value, g.range);
    setDraft(pending.current);
    onPreview?.(pending.current, g.edge);
  }
  function cancel() {
    if (gesture.current) {
      suppressClick.current = true;
      onPreview?.(gesture.current.range, gesture.current.edge);
    }
    gesture.current = null;
    setDraft(null);
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const g = gesture.current;
    if (!g || g.pointer !== event.pointerId) return;
    move(event);
    gesture.current = null;
    suppressClick.current = g.edge === 'body' && g.moved;
    if (pending.current.start !== range.start || pending.current.end !== range.end) {
      if (g.edge === 'body') onMove?.(pending.current.start - g.range.start);
      else onChange(pending.current);
    }
    setDraft(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div
      ref={element}
      data-wide-handles={wideHandles || undefined}
      data-effect-timeline={selectOnPointer || undefined}
      data-duration={duration}
      data-speed={displaySpeed}
      className={`timeline-range ${className} ${draft ? 'trimming' : ''} ${onMove ? 'movable-range' : ''}`}
      style={{
        left:
          selectOnPointer || wideHandles
            ? `max(0px, min(${left}, calc(100% - max(var(--effect-hit-width, 48px), ${width}))))`
            : left,
        width,
      }}
      onFocusCapture={() => menu?.focus(target)}
      onKeyDownCapture={(event) => {
        if (!menu || !(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')))
          return;
        const box = event.currentTarget.getBoundingClientRect();
        menu.open(
          {
            clientX: box.left + box.width / 2,
            clientY: box.bottom,
            target: event.target,
            preventDefault: () => event.preventDefault(),
            stopPropagation: () => event.stopPropagation(),
          } as import('react').MouseEvent<HTMLElement>,
          target,
        );
      }}
      onContextMenu={(event) => {
        if (menu) {
          cancel();
          menu.open(event, target);
        } else if (remove) {
          event.preventDefault();
          event.stopPropagation();
          if (!disabled) {
            cancel();
            remove.run();
          }
        }
      }}
    >
      <button
        className="range-body"
        disabled={disabled}
        {...bodyProps}
        onClick={(event) => {
          if (!suppressClick.current && (event.detail === 0 || selectOnPointer)) onSelect();
        }}
        onPointerDown={
          onMove
            ? (event) => {
                event.stopPropagation();
                if (disabled || event.button !== 0) return;
                const bounds = event.currentTarget
                  .closest('.timeline-lane')!
                  .getBoundingClientRect();
                if (!bounds.width) return;
                event.preventDefault();
                event.currentTarget.focus({ preventScroll: true });
                suppressClick.current = false;
                gesture.current = {
                  pointer: event.pointerId,
                  edge: 'body',
                  range,
                  origin: event.clientX,
                  width: bounds.width,
                  moved: false,
                  targets: gestureTargets(),
                };
                pending.current = range;
                event.currentTarget.setPointerCapture(event.pointerId);
                onSelect(true);
              }
            : bodyProps?.onPointerDown
        }
        onPointerMove={onMove ? move : bodyProps?.onPointerMove}
        onPointerUp={onMove ? finish : bodyProps?.onPointerUp}
        onPointerCancel={onMove ? cancel : bodyProps?.onPointerCancel}
        onLostPointerCapture={onMove ? cancel : bodyProps?.onLostPointerCapture}
        onKeyDown={(event) => {
          bodyProps?.onKeyDown?.(event);
          if (event.key === 'Escape') {
            cancel();
            event.stopPropagation();
            return;
          }
          if (
            !event.defaultPrevented &&
            onMove &&
            ['ArrowLeft', 'ArrowRight'].includes(event.key)
          ) {
            event.preventDefault();
            event.stopPropagation();
            const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 0.1 : 0.01);
            const bounds = moveLimits ?? {
                start: limits.start - range.start,
                end: limits.end - range.end,
              },
              movement = Math.max(bounds.start, Math.min(bounds.end, delta));
            onSelect(true);
            onMove(movement);
            onPreview?.({ start: range.start + movement, end: range.end + movement }, 'body');
          }
          if (!event.defaultPrevented && remove && ['Delete', 'Backspace'].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            remove.run();
          }
        }}
        aria-label={label}
        title={`${label} · ${time(shown.start)}–${time(shown.end)}${remove ? ' · Right-click for actions · Delete to remove' : ''}`}
      >
        <span>{text ?? label}</span>
      </button>
      {renderContent?.(shown)}
      {edges.map((edge) => (
        <button
          key={edge}
          className={`range-handle ${edge}`}
          role="slider"
          aria-label={edge === 'start' ? startLabel : endLabel}
          title={edge === 'start' ? startTitle : endTitle}
          aria-orientation="horizontal"
          aria-valuemin={
            edgeLimits?.[edge]?.start ?? (edge === 'start' ? limits.start : shown.start + minimum)
          }
          aria-valuemax={
            edgeLimits?.[edge]?.end ?? (edge === 'start' ? shown.end - minimum : limits.end)
          }
          aria-valuenow={shown[edge]}
          aria-valuetext={`${shown[edge].toFixed(2)} seconds`}
          disabled={disabled}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (disabled || event.button !== 0) return;
            const bounds = event.currentTarget.closest('.timeline-lane')!.getBoundingClientRect();
            if (!bounds.width) return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            gesture.current = {
              pointer: event.pointerId,
              edge,
              range,
              origin: event.clientX,
              width: bounds.width,
              moved: false,
              targets: gestureTargets(),
            };
            pending.current = range;
            event.currentTarget.setPointerCapture(event.pointerId);
            if (selectOnPointer) onSelect(true);
          }}
          onPointerMove={(event) => {
            event.stopPropagation();
            move(event);
          }}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              cancel();
              event.stopPropagation();
              return;
            }
            const step = event.shiftKey ? 0.1 : 0.01;
            const next =
              event.key === 'Home'
                ? limits.start
                : event.key === 'End'
                  ? limits.end
                  : event.key === 'ArrowLeft'
                    ? shown[edge] - step
                    : event.key === 'ArrowRight'
                      ? shown[edge] + step
                      : event.key === 'PageDown'
                        ? shown[edge] - 1
                        : event.key === 'PageUp'
                          ? shown[edge] + 1
                          : null;
            if (next === null) return;
            event.preventDefault();
            event.stopPropagation();
            if (selectOnPointer) onSelect(true);
            const updated = constrain(edge, Math.round(next * 100) / 100, range);
            onChange(updated);
            onPreview?.(updated, edge);
          }}
        >
          <span aria-hidden="true" />
        </button>
      ))}
      {draft && (
        <output className="range-readout">
          {snapped ? 'Snapped · ' : ''}
          {shown.start.toFixed(2)}–{shown.end.toFixed(2)}s
        </output>
      )}
    </div>
  );
}
