import { useEffect, useRef, useState } from 'react';
import { gradeLayerPasses, type imageGradePlan } from '../core/realtime-grade';
import { GradeRenderer } from '../engines/grade-renderer';
import { useLatest } from '../hooks/useLatest';

type Plan = NonNullable<ReturnType<typeof imageGradePlan>>;
/** Pixels graded per edit; zooming in raises it up to the full picture. */
const maxEdge = 4096,
  softwareEdge = 2048;

/**
 * Grades the decoded original image on the GPU for each edit, so adjustment
 * layers update while dragging instead of waiting for an FFmpeg composite.
 */
export function GradedImage({
  src,
  plan,
  size,
  displayEdge,
  onReady,
  onFailure,
}: {
  src: string;
  plan: Plan;
  /** The original picture size; `plan.crop` is measured in these pixels. */
  size: { width: number; height: number };
  /** Longest displayed edge in device pixels, including zoom. */
  displayEdge: number;
  onReady: (ready: boolean) => void;
  onFailure: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null),
    rendererRef = useRef<GradeRenderer | null>(null),
    uploaded = useRef<HTMLCanvasElement | HTMLImageElement | null>(null);
  const [image, setImage] = useState<HTMLCanvasElement | HTMLImageElement | null>(null);
  const callbacks = useLatest({ onReady, onFailure });
  useEffect(() => {
    const canvas = canvasRef.current!;
    try {
      rendererRef.current = new GradeRenderer(canvas, true);
    } catch {
      callbacks.current.onFailure();
      return;
    }
    const lost = (event: Event) => {
      event.preventDefault();
      callbacks.current.onFailure();
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      uploaded.current = null;
    };
  }, [callbacks]);
  useEffect(() => {
    let stale = false;
    callbacks.current.onReady(false);
    const element = new Image();
    element.crossOrigin = 'anonymous';
    element.decoding = 'async';
    element.src = src;
    element
      .decode()
      .then(() => {
        if (stale) return;
        const limit = rendererRef.current?.maxTextureSize ?? 4096,
          ratio = Math.min(1, limit / Math.max(element.naturalWidth, element.naturalHeight));
        if (ratio === 1) return setImage(element);
        // Textures larger than the GPU supports are uploaded at a reduced size.
        const scaled = document.createElement('canvas');
        scaled.width = Math.max(1, Math.floor(element.naturalWidth * ratio));
        scaled.height = Math.max(1, Math.floor(element.naturalHeight * ratio));
        scaled.getContext('2d')!.drawImage(element, 0, 0, scaled.width, scaled.height);
        setImage(scaled);
      })
      .catch(() => {
        if (!stale) callbacks.current.onFailure();
      });
    return () => {
      stale = true;
    };
  }, [src, callbacks]);
  useEffect(() => {
    const canvas = canvasRef.current,
      renderer = rendererRef.current;
    if (!canvas || !renderer || !image) return;
    const crop = plan.crop ?? { x: 0, y: 0, ...size },
      frame = plan.size.width && plan.size.height ? plan.size : crop;
    const edge = Math.min(
        renderer.software ? softwareEdge : maxEdge,
        Math.max(256, displayEdge),
        Math.max(frame.width, frame.height),
      ),
      ratio = edge / Math.max(frame.width, frame.height);
    const width = Math.max(1, Math.round(frame.width * ratio)),
      height = Math.max(1, Math.round(frame.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    try {
      renderer.render(
        uploaded.current === image ? null : image,
        gradeLayerPasses(plan.layers),
        frame,
        null,
        0,
        {
          x: crop.x / size.width,
          y: crop.y / size.height,
          width: crop.width / size.width,
          height: crop.height / size.height,
        },
        plan.turn,
      );
      uploaded.current = image;
      callbacks.current.onReady(true);
    } catch {
      callbacks.current.onFailure();
    }
  }, [image, plan, size, displayEdge, callbacks]);
  return (
    <canvas
      ref={canvasRef}
      className="graded-image"
      data-realtime-grade
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
