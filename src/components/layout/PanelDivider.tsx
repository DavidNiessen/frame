import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { clampPanel } from '../../core/panel-layout';
interface Props {
  label: string;
  axis: 'x' | 'y';
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  reverse?: boolean;
  resize: (value: number) => void;
  controls: string;
}
export function PanelDivider({
  label,
  axis,
  value,
  min,
  max,
  defaultValue,
  reverse = false,
  resize,
  controls,
}: Props) {
  const gesture = useRef<{ pointer: number; start: number; value: number } | null>(null);
  const [active, setActive] = useState(false);
  const sign = reverse ? -1 : 1;
  const coordinate = (event: PointerEvent) => (axis === 'x' ? event.clientX : event.clientY);
  const apply = (next: number) => resize(clampPanel(next, min, max));
  useEffect(() => {
    if (active) document.documentElement.classList.add('resizing-panels');
    return () => document.documentElement.classList.remove('resizing-panels');
  }, [active]);
  function end(cancel: boolean) {
    const current = gesture.current;
    gesture.current = null;
    setActive(false);
    if (cancel && current) apply(current.value);
  }
  return (
    <div
      className={`panel-divider ${axis === 'x' ? 'vertical' : 'horizontal'}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-controls={controls}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} pixels`}
      data-resizing={active || undefined}
      title={`${label} · drag or use arrow keys · double-click to reset`}
      onDoubleClick={() => apply(defaultValue)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        gesture.current = { pointer: event.pointerId, start: coordinate(event), value };
        setActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (current?.pointer === event.pointerId)
          apply(current.value + (coordinate(event) - current.start) * sign);
      }}
      onPointerUp={(event) => {
        if (gesture.current?.pointer !== event.pointerId) return;
        end(false);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => end(true)}
      onLostPointerCapture={() => {
        if (gesture.current) end(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          end(true);
          return;
        }
        const less = axis === 'x' ? 'ArrowLeft' : 'ArrowUp',
          more = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        const step = event.shiftKey ? 40 : 10;
        const next =
          event.key === 'Home'
            ? min
            : event.key === 'End'
              ? max
              : event.key === less
                ? value - step * sign
                : event.key === more
                  ? value + step * sign
                  : null;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        apply(next);
      }}
    >
      <span aria-hidden="true" />
    </div>
  );
}
