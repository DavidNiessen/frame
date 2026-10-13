import { useContext, useEffect, useRef, useState, type PointerEvent } from 'react';
import { parseRetouch, type RetouchStroke } from '../core/retouch';
import { rasterRetouch, retouchRenderer } from '../engines/retouch-renderer';
import { FrameInteractionContext } from './frame-interaction';
import { useRetouchSource } from './RetouchSource';
import { useLoadingActivity } from '../hooks/useLoadingActivity';
import type { EditSettings } from '../core/types';
export function RetouchCanvas({
  edit,
  update,
  url,
  width,
  height,
  layerKey,
  disabled,
  onError,
}: {
  edit: EditSettings;
  update: (patch: Partial<EditSettings>) => void;
  url?: string;
  width: number;
  height: number;
  layerKey: string;
  disabled: boolean;
  onError: (message: string) => void;
}) {
  const value = parseRetouch(edit.retouch),
    interaction = useContext(FrameInteractionContext),
    sourceContext = useRetouchSource(),
    setSource = sourceContext?.setSource,
    canvas = useRef<HTMLCanvasElement>(null),
    renderer = useRef<Awaited<ReturnType<typeof retouchRenderer>> | null>(null),
    stroke = useRef<RetouchStroke | null>(null),
    queued = useRef<RetouchStroke[] | null>(null),
    rendering = useRef(false),
    [saving, setSaving] = useState(false),
    [ready, setReady] = useState(false),
    [cursor, setCursor] = useState<{ x: number; y: number } | null>(null),
    alive = useRef(true);
  const ratio = Math.min(1, 1024 / width, 1024 / height),
    current = useRef({ value, update, interaction, onError });
  current.current = { value, update, interaction, onError };
  useLoadingActivity(saving, 'Rendering retouch layer…');
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setReady(false);
    if (!url) return;
    setSource?.({ key: layerKey, url, width, height });
    let stale = false;
    void retouchRenderer(url, width, height, 1024)
      .then((next) => {
        if (stale) next.close();
        else {
          renderer.current = next;
          setReady(true);
        }
      })
      .catch((e) => {
        if (!stale) current.current.onError(e.message);
      });
    return () => {
      stale = true;
      renderer.current?.close();
      renderer.current = null;
      setSource?.(null);
    };
  }, [url, width, height, layerKey, setSource]);
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      y: Math.max(0, Math.min(1, (e.clientY - box.top) / box.height)),
    };
  };
  async function preview() {
    queued.current = [
      ...current.current.value.strokes,
      ...(stroke.current ? [structuredClone(stroke.current)] : []),
    ];
    if (rendering.current) return;
    rendering.current = true;
    try {
      while (queued.current && renderer.current) {
        const strokes = queued.current;
        queued.current = null;
        const image = await renderer.current.preview(strokes),
          context = canvas.current?.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
          context.drawImage(image, 0, 0);
        }
        image.close();
      }
    } catch (error) {
      if (alive.current && stroke.current) current.current.onError((error as Error).message);
    } finally {
      rendering.current = false;
    }
  }
  async function finish() {
    const next = stroke.current;
    if (!next || !url) return;
    stroke.current = null;
    setSaving(true);
    try {
      const settings = {
          ...current.current.value,
          strokes: [...current.current.value.strokes, next],
        },
        image = await rasterRetouch(url, settings, width, height);
      if (alive.current) current.current.update({ retouch: { ...settings, image } });
    } catch (error) {
      if (alive.current) current.current.onError((error as Error).message);
    } finally {
      if (alive.current) {
        setSaving(false);
        current.current.interaction?.finish();
      }
    }
  }
  return (
    <div className="retouch-canvas-wrap">
      <canvas
        ref={canvas}
        className="retouch-canvas"
        aria-busy={saving || !ready}
        aria-label="Retouch image"
        width={Math.max(1, Math.round(width * ratio))}
        height={Math.max(1, Math.round(height * ratio))}
        onPointerDown={(e) => {
          if (disabled || saving || !renderer.current || e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const p = point(e);
          if (e.altKey) {
            update({ retouch: { ...value, source: p } });
            return;
          }
          if (!value.source && value.mode !== 'erase') {
            onError('Alt/Option-click to choose a retouch source first.');
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          interaction?.start();
          stroke.current = {
            points: [p],
            source: value.source ?? p,
            mode: value.mode,
            size: value.size,
            hardness: value.hardness,
            opacity: value.opacity,
          };
          void preview();
        }}
        onPointerMove={(e) => {
          const p = point(e);
          setCursor(p);
          if (!stroke.current) return;
          const last = stroke.current.points.at(-1)!;
          if (
            Math.hypot(p.x - last.x, p.y - last.y) > 0.002 &&
            stroke.current.points.length < 4000
          ) {
            stroke.current.points.push(p);
            void preview();
          }
        }}
        onPointerLeave={() => setCursor(null)}
        onPointerUp={() => void finish()}
        onPointerCancel={() => {
          stroke.current = null;
          interaction?.finish();
        }}
      />
      {value.source && (
        <span
          className="retouch-source-point"
          style={{ left: `${value.source.x * 100}%`, top: `${value.source.y * 100}%` }}
          aria-label="Retouch source point"
        >
          +
        </span>
      )}
      {cursor && (
        <span
          className="retouch-brush-cursor"
          style={{
            left: `${cursor.x * 100}%`,
            top: `${cursor.y * 100}%`,
            width: `${value.size * 100}%`,
            aspectRatio: '1',
          }}
        />
      )}
    </div>
  );
}
