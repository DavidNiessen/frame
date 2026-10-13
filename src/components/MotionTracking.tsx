import { useEffect, useRef, useState } from 'react';
import { Scan, X } from 'lucide-react';
import { trackingDimensions } from '../core/analysis-data';
import { trackedAnimation, type TrackingRegion } from '../core/motion-tracking';
import { changeMediaLayer, type MediaLayer } from '../core/media-layers';
import { loadingActivity } from '../core/loading-activity';
import type { Editor } from '../hooks/useEditor';
export function MotionTracking({
  editor,
  layer,
  current,
  seek,
}: {
  editor: Editor;
  layer: MediaLayer;
  current: number;
  seek: (time: number) => void;
}) {
  const [frames, setFrames] = useState<{
      bytes: Uint8Array;
      width: number;
      height: number;
      fps: number;
      start: number;
      end: number;
    } | null>(null),
    [region, setRegion] = useState<TrackingRegion | null>(null),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null),
    anchor = useRef<{ x: number; y: number } | null>(null),
    stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  useEffect(() => {
    if (!frames || !canvas.current) return;
    const context = canvas.current.getContext('2d')!,
      rgba = new Uint8ClampedArray(frames.width * frames.height * 4);
    for (let i = 0; i < frames.width * frames.height; i++) {
      rgba.set([frames.bytes[i], frames.bytes[i], frames.bytes[i], 255], i * 4);
    }
    context.putImageData(new ImageData(rgba, frames.width, frames.height), 0, 0);
    if (region) {
      context.strokeStyle = '#a99aff';
      context.lineWidth = 2;
      context.setLineDash([4, 3]);
      context.strokeRect(region.x, region.y, region.width, region.height);
    }
  }, [frames, region]);
  async function prepare() {
    if (!editor.asset || !editor.edit) return;
    setLoading(true);
    setMessage('');
    setRegion(null);
    const asset = editor.asset,
      edit = editor.edit,
      start = Math.max(layer.start, Math.min(current, layer.end - 0.125)),
      end = Math.min(layer.end, start + 30);
    try {
      // Keep the rendered sequence geometry, but omit the tracked object itself.
      const recipe = {
        ...edit,
        mediaLayers: edit.mediaLayers?.map((item) =>
          item.id === layer.id ? { ...item, hidden: true } : item,
        ),
      };
      const bytes = await editor.runExclusive('analysis', (engine) =>
        engine.analysisData(asset, recipe, { kind: 'tracking', start, end }, () => {}),
      );
      setFrames({ bytes, ...trackingDimensions(asset, recipe), start, end });
      seek(start);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function track() {
    if (!frames || !region) return;
    setLoading(true);
    setMessage('');
    const instance = new Worker(new URL('../engines/motion-worker.ts', import.meta.url), {
      type: 'module',
    });

    let rejectTask: (error: Error) => void = () => {};
    const activity = loadingActivity.start('Tracking subject…', {
      priority: 20,
      cancel: () => {
        instance.terminate();
        rejectTask(new Error('Motion tracking cancelled.'));
      },
      cancelLabel: 'Cancel tracking',
    });
    try {
      stop.current = () => {
        instance.terminate();
        rejectTask(new Error('Motion tracking cancelled.'));
      };
      const result = await editor.runExclusive(
        'analysis',
        () =>
          new Promise<import('../core/motion-tracking').MotionResult>((resolve, reject) => {
            rejectTask = reject;
            instance.onmessage = (event) => {
              if (event.data.error) reject(new Error(event.data.error));
              else if (event.data.result) resolve(event.data.result);
              else activity.update({ ratio: event.data.ratio, message: 'Tracking subject…' });
            };
            instance.onerror = () => reject(new Error('Motion tracking failed.'));
            const copy = new Uint8Array(frames.bytes);
            instance.postMessage({ ...frames, bytes: copy.buffer, region }, [copy.buffer]);
          }),
      );
      editor.update(
        changeMediaLayer(editor.edit!, layer.id, {
          animation: trackedAnimation(layer, result, frames.start, frames.width, frames.height),
        }),
      );
      setMessage(
        result.lostAt !== undefined
          ? `Subject lost after ${result.lostAt.toFixed(1)}s. The reliable part was applied; review its keyframes.`
          : 'Motion applied. Review or refine the X/Y keyframes above.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      instance.terminate();
      stop.current = null;
      activity.finish();
      setLoading(false);
    }
  }
  if (editor.asset?.kind !== 'video') return null;
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          event.currentTarget.width,
          ((event.clientX - box.left) * event.currentTarget.width) / box.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          event.currentTarget.height,
          ((event.clientY - box.top) * event.currentTarget.height) / box.height,
        ),
      ),
    };
  };
  return (
    <details className="advanced">
      <summary>
        <Scan size={14} /> Motion tracking
      </summary>
      <div className="advanced-content">
        <p className="field-note">
          Follow a textured subject for up to 30 seconds from the playhead. Drag a box around it
          below. Tracking replaces X/Y keyframes; size and opacity stay editable.
        </p>
        <button
          className="button subtle small"
          disabled={loading || !!editor.busy}
          onClick={() => void prepare()}
        >
          {frames ? 'Refresh tracking frames' : 'Prepare tracking frames'}
        </button>
        {frames && (
          <>
            <canvas
              ref={canvas}
              width={frames.width}
              height={frames.height}
              className="motion-selection"
              aria-label="Select a subject to track"
              onPointerDown={(event) => {
                if (loading) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                anchor.current = point(event);
                setRegion(null);
              }}
              onPointerMove={(event) => {
                if (!anchor.current) return;
                const p = point(event),
                  a = anchor.current;
                setRegion({
                  x: Math.round(Math.min(a.x, p.x)),
                  y: Math.round(Math.min(a.y, p.y)),
                  width: Math.round(Math.abs(p.x - a.x)),
                  height: Math.round(Math.abs(p.y - a.y)),
                });
              }}
              onPointerUp={() => {
                anchor.current = null;
              }}
              onPointerCancel={() => {
                anchor.current = null;
              }}
            />
            <button
              className="button primary small"
              disabled={
                loading || !!editor.busy || !region || region.width < 8 || region.height < 8
              }
              onClick={() => void track()}
            >
              <Scan size={14} />
              Track subject
            </button>
            <button
              className="button subtle small"
              disabled={loading}
              onClick={() => {
                setFrames(null);
                setRegion(null);
              }}
            >
              <X size={14} />
              Clear selection
            </button>
            <p className="field-note">
              Local template tracking follows position. It stops on lost detail; review fast
              movement, cuts and occlusions.
            </p>
          </>
        )}
        {message && (
          <p role="status" className="field-note">
            {message}
          </p>
        )}
      </div>
    </details>
  );
}
