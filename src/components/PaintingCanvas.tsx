import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { drawStroke, parsePainting, type PaintStroke } from '../core/painting';
import { rasterPainting } from '../engines/painting-raster';
import type { EditSettings } from '../core/types';
export function PaintingCanvas({
  edit,
  update,
  width,
  height,
  disabled,
  onError,
  showExisting = false,
  label = 'Paint on frame',
}: {
  showExisting?: boolean;
  label?: string;
  edit: EditSettings;
  update: (patch: Partial<EditSettings>) => void;
  width: number;
  height: number;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    stroke = useRef<PaintStroke | null>(null),
    [saving, setSaving] = useState(false);
  const value = useMemo(() => parsePainting(edit.painting), [edit.painting]),
    alive = useRef(true),
    ratio = Math.min(1, 2048 / width, 2048 / height);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    };
  }
  const redraw = useCallback(() => {
    const canvas = ref.current,
      context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (showExisting)
      for (const previous of value.strokes)
        drawStroke(context, previous, canvas.width, canvas.height);
    if (stroke.current) drawStroke(context, stroke.current, canvas.width, canvas.height);
  }, [showExisting, value.strokes]);
  useEffect(() => {
    redraw();
  }, [redraw, width, height]);
  async function finish() {
    const next = stroke.current;
    if (!next) return;
    stroke.current = null;
    setSaving(true);
    try {
      const strokes = [...value.strokes, next],
        image = await rasterPainting(strokes, width, height);
      if (alive.current) update({ painting: { ...value, strokes, image } });
    } catch (error) {
      onError((error as Error).message);
    } finally {
      if (alive.current) {
        setSaving(false);
        redraw();
      }
    }
  }
  return (
    <canvas
      ref={ref}
      className="painting-canvas"
      aria-label={label}
      width={Math.max(1, Math.round(width * ratio))}
      height={Math.max(1, Math.round(height * ratio))}
      onPointerDown={(e) => {
        if (disabled || saving || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        stroke.current = {
          points: [point(e)],
          color: value.color,
          size: value.size,
          opacity: value.opacity,
          erase: value.erase,
        };
        redraw();
      }}
      onPointerMove={(e) => {
        if (!stroke.current) return;
        const next = point(e),
          previous = stroke.current.points.at(-1)!;
        if (
          Math.hypot(next.x - previous.x, next.y - previous.y) > 0.0005 &&
          stroke.current.points.length < 10000
        ) {
          stroke.current.points.push(next);
          redraw();
        }
      }}
      onPointerUp={() => void finish()}
      onPointerCancel={() => {
        stroke.current = null;
        redraw();
      }}
    />
  );
}
