import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { parseCutout } from '../core/cutout';
import { drawStroke, type PaintStroke } from '../core/painting';
import { rasterCutout } from '../engines/cutout-renderer';
import { useLoadingActivity } from '../hooks/useLoadingActivity';
import type { EditSettings } from '../core/types';
export function CutoutCanvas({
  edit,
  update,
  url,
  width,
  height,
  disabled,
  onError,
}: {
  edit: EditSettings;
  update: (patch: Partial<EditSettings>) => void;
  url?: string;
  width: number;
  height: number;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const value = parseCutout(edit.cutout),
    ref = useRef<HTMLCanvasElement>(null),
    stroke = useRef<PaintStroke | null>(null),
    [busy, setBusy] = useState(false),
    latest = useRef({ value, update, onError });
  latest.current = { value, update, onError };
  const signature = JSON.stringify({ url, value }),
    ratio = Math.min(1, 2048 / width, 2048 / height);
  useLoadingActivity(busy, 'Removing image background…');
  useEffect(() => {
    if (!url || latest.current.value.image) return;
    const controller = new AbortController();
    setBusy(true);
    void rasterCutout(url, latest.current.value, width, height, controller.signal)
      .then((image) => {
        if (!controller.signal.aborted)
          latest.current.update({ cutout: { ...latest.current.value, image } });
      })
      .catch((error) => {
        if (!controller.signal.aborted) latest.current.onError((error as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
          ref.current?.getContext('2d')?.clearRect(0, 0, ref.current.width, ref.current.height);
        }
      });
    return () => {
      controller.abort();
      setBusy(false);
    };
  }, [signature, url, width, height]);
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    };
  };
  const redraw = () => {
    const canvas = ref.current,
      context = canvas?.getContext('2d');
    if (context && canvas) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (stroke.current)
        drawStroke(
          context,
          {
            ...stroke.current,
            color: stroke.current.color === '#ffffff' ? '#a99bff' : '#ef729c',
            opacity: 0.55,
          },
          canvas.width,
          canvas.height,
        );
    }
  };
  return (
    <canvas
      className="cutout-refine-canvas"
      ref={ref}
      aria-label="Refine image background"
      aria-busy={busy || !url}
      width={Math.max(1, Math.round(width * ratio))}
      height={Math.max(1, Math.round(height * ratio))}
      onPointerDown={(e) => {
        if (disabled || busy || !url || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const p = point(e);
        if (value.tool === 'sample') {
          update({
            cutout: { ...value, background: 'sample', sample: p, tool: 'remove', image: null },
          });
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        stroke.current = {
          points: [p],
          color: value.tool === 'restore' ? '#ffffff' : '#000000',
          size: value.size,
          opacity: 1,
          erase: false,
        };
        redraw();
      }}
      onPointerMove={(e) => {
        if (!stroke.current) return;
        const p = point(e),
          last = stroke.current.points.at(-1)!;
        if (
          Math.hypot(p.x - last.x, p.y - last.y) > 0.001 &&
          stroke.current.points.length < 10000
        ) {
          stroke.current.points.push(p);
          redraw();
        }
      }}
      onPointerUp={() => {
        if (stroke.current) {
          update({
            cutout: { ...value, strokes: [...value.strokes, stroke.current], image: null },
          });
          stroke.current = null;
        }
      }}
      onPointerCancel={() => {
        stroke.current = null;
        redraw();
      }}
    />
  );
}
