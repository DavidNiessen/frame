import { useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, Trash2 } from 'lucide-react';
import {
  curveChannels,
  curveSamples,
  defaultCurves,
  parseCurves,
  type CurveChannel,
  type CurvePoint,
} from '../core/curves';
import { useFrameHistogram } from '../hooks/useFrameHistogram';
import type { EditSettings } from '../core/types';
const colors = { master: 'var(--accent)', red: '#f27785', green: '#6ac995', blue: '#76aaff' };
export function CurvesControls({
  edit,
  update,
}: {
  edit: EditSettings;
  update: (patch: Partial<EditSettings>) => void;
}) {
  const curves = parseCurves(edit.curves),
    [channel, setChannel] = useState<CurveChannel>('master'),
    [selected, setSelected] = useState(0),
    [draft, setDraft] = useState<CurvePoint[] | null>(null),
    gesture = useRef<CurvePoint[] | null>(null),
    histogram = useFrameHistogram();
  const points = draft ?? curves[channel];
  const commit = (next: CurvePoint[]) => update({ curves: { ...curves, [channel]: next } });
  const fromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };
  function start(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = fromPointer(e),
      rect = e.currentTarget.getBoundingClientRect();
    let index = points.findIndex(
      (q) => Math.hypot((q.x - p.x) * rect.width, (q.y - p.y) * rect.height) < 14,
    );
    const next = points.map((p) => ({ ...p }));
    if (index < 0) {
      if (next.length >= 16) return;
      if (p.x < 0.005 || p.x > 0.995) return;
      next.push(p);
      next.sort((a, b) => a.x - b.x);
      index = next.indexOf(p);
    }
    gesture.current = next;
    setSelected(index);
    setDraft(next);
  }
  function drag(e: PointerEvent<SVGSVGElement>) {
    if (!gesture.current) return;
    const p = fromPointer(e),
      next = gesture.current.map((p) => ({ ...p })),
      index = selected;
    p.x =
      index === 0
        ? 0
        : index === next.length - 1
          ? 1
          : Math.max(next[index - 1].x + 0.002, Math.min(next[index + 1].x - 0.002, p.x));
    next[index] = p;
    gesture.current = next;
    setDraft(next);
  }
  const finish = () => {
    if (gesture.current) commit(gesture.current);
    gesture.current = null;
    setDraft(null);
  };
  const bins = histogram?.[channel === 'master' ? 'luminance' : channel],
    max = Math.max(1, ...(bins ?? []));
  const histogramPath = bins
    ? `M0,240 ${bins.map((n, i) => `L${(i * 240) / 255},${240 - (220 * Math.log1p(n)) / Math.log1p(max)}`).join(' ')} L240,240 Z`
    : '';
  const curvePath = curveSamples(points)
    .map((y, i) => `${i ? 'L' : 'M'}${(i * 240) / 255},${240 - y * 240}`)
    .join(' ');
  const point = points[Math.min(selected, points.length - 1)];
  return (
    <section className="control-section curves-controls">
      <label className="stacked-label">
        Channel
        <select
          aria-label="Curve channel"
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value as CurveChannel);
            setSelected(0);
            setDraft(null);
            gesture.current = null;
          }}
        >
          {curveChannels.map((c) => (
            <option key={c} value={c}>
              {c === 'master' ? 'RGB · master' : c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <svg
        className="curves-graph"
        viewBox="0 0 240 240"
        role="application"
        aria-label="Tone curve · click to add, drag to adjust"
        tabIndex={0}
        onPointerDown={start}
        onPointerMove={drag}
        onPointerUp={finish}
        onPointerCancel={() => {
          gesture.current = null;
          setDraft(null);
        }}
        onLostPointerCapture={() => {
          gesture.current = null;
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (
            ['Delete', 'Backspace'].includes(e.key) &&
            selected > 0 &&
            selected < points.length - 1
          ) {
            e.preventDefault();
            commit(points.filter((_, i) => i !== selected));
            setSelected(0);
          }
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const p = { ...point };
            if (e.key === 'ArrowUp') p.y = Math.min(1, p.y + 0.01);
            if (e.key === 'ArrowDown') p.y = Math.max(0, p.y - 0.01);
            if (selected > 0 && selected < points.length - 1)
              p.x = Math.max(
                points[selected - 1].x + 0.002,
                Math.min(
                  points[selected + 1].x - 0.002,
                  p.x + (e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0),
                ),
              );
            commit(points.map((v, i) => (i === selected ? p : v)));
          }
        }}
      >
        <path d={histogramPath} fill={colors[channel]} opacity=".17" />
        {[60, 120, 180].map((n) => (
          <path key={n} d={`M${n},0 V240 M0,${n} H240`} className="curve-grid" />
        ))}
        <path d="M0,240 L240,0" className="curve-diagonal" />
        <path d={curvePath} fill="none" stroke={colors[channel]} strokeWidth={2.5} />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x * 240}
            cy={(1 - p.y) * 240}
            r={i === selected ? 5 : 4}
            fill={i === selected ? colors[channel] : 'var(--surface)'}
            stroke={colors[channel]}
            strokeWidth={2}
          />
        ))}
      </svg>
      <div className="curve-point-nav">
        <button
          className="icon-button"
          aria-label="Previous curve point"
          disabled={selected === 0}
          onClick={() => setSelected((v) => v - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span>
          Point {Math.min(selected + 1, points.length)} of {points.length}
        </span>
        <button
          className="icon-button"
          aria-label="Next curve point"
          disabled={selected >= points.length - 1}
          onClick={() => setSelected((v) => v + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="curve-point-values">
        <label className="stacked-label">
          Input
          <input
            type="number"
            aria-label="Curve point input"
            min={0}
            max={255}
            step={1}
            value={Math.round(point.x * 255)}
            disabled={selected === 0 || selected === points.length - 1}
            onChange={(e) => {
              const x = Math.max(
                points[selected - 1].x + 0.002,
                Math.min(points[selected + 1].x - 0.002, Number(e.target.value) / 255),
              );
              commit(points.map((p, i) => (i === selected ? { ...p, x } : p)));
            }}
          />
        </label>
        <label className="stacked-label">
          Output
          <input
            type="number"
            aria-label="Curve point output"
            min={0}
            max={255}
            step={1}
            value={Math.round(point.y * 255)}
            onChange={(e) =>
              commit(
                points.map((p, i) =>
                  i === selected
                    ? { ...p, y: Math.max(0, Math.min(1, Number(e.target.value) / 255)) }
                    : p,
                ),
              )
            }
          />
        </label>
      </div>
      <div className="painting-actions">
        <button
          className="button subtle small"
          disabled={selected === 0 || selected === points.length - 1}
          onClick={() => {
            commit(points.filter((_, i) => i !== selected));
            setSelected(0);
          }}
        >
          <Trash2 size={13} />
          Remove point
        </button>
        <button
          className="button subtle small"
          onClick={() => {
            commit(defaultCurves()[channel]);
            setSelected(0);
          }}
        >
          <RotateCcw size={13} />
          Reset channel
        </button>
      </div>
      <p className="field-note">
        Click the curve to add a point. Drag to adjust, or use arrow keys and numerical values. The
        background histogram shows the current frame’s tones.
      </p>
      <div className="curve-presets">
        <button
          className="button subtle small"
          onClick={() => {
            setSelected(0);
            commit([
              { x: 0, y: 0 },
              { x: 0.25, y: 0.18 },
              { x: 0.75, y: 0.82 },
              { x: 1, y: 1 },
            ]);
          }}
        >
          Contrast
        </button>
        <button
          className="button subtle small"
          onClick={() => {
            setSelected(0);
            commit([
              { x: 0, y: 0.08 },
              { x: 0.4, y: 0.5 },
              { x: 1, y: 1 },
            ]);
          }}
        >
          Lift shadows
        </button>
        <button
          className="button subtle small"
          onClick={() => {
            setSelected(0);
            commit([
              { x: 0, y: 0 },
              { x: 0.7, y: 0.6 },
              { x: 1, y: 0.93 },
            ]);
          }}
        >
          Soften highlights
        </button>
      </div>
    </section>
  );
}
