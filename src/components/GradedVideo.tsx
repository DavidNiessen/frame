import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { gradeAt, gradePasses } from '../core/realtime-grade';
import { previewOutput, readPreviewTime } from '../core/preview-clock';
import type { EditSettings, MediaAsset } from '../core/types';
import { GradeRenderer } from '../engines/grade-renderer';
import { useLatest } from '../hooks/useLatest';

/** Grading cost follows displayed pixels, not the source resolution. */
const maxEdge = 1920,
  softwareEdge = 960;

/**
 * Draws the playing video through the GPU grade. The media element keeps the
 * clock, audio and decoding; this canvas only replaces its pixels.
 */
export function GradedVideo({
  mediaRef,
  asset,
  edit,
  style,
  onFailure,
}: {
  mediaRef: RefObject<HTMLMediaElement | null>;
  asset: MediaAsset;
  edit: EditSettings;
  style: CSSProperties;
  onFailure: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useLatest({ asset, edit, onFailure });
  const dirty = useRef(true);
  useEffect(() => {
    dirty.current = true;
  }, [edit, asset]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: GradeRenderer;
    try {
      renderer = new GradeRenderer(canvas);
    } catch {
      latest.current.onFailure();
      return;
    }
    let frame = 0,
      shown = '';
    const lost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      latest.current.onFailure();
    };
    canvas.addEventListener('webglcontextlost', lost);
    function draw() {
      frame = requestAnimationFrame(draw);
      const media = mediaRef.current as HTMLVideoElement | null;
      if (!media || media.readyState < 2 || media.seeking || !media.videoWidth) return;
      const displayed = Math.max(canvas!.clientWidth, canvas!.clientHeight) * devicePixelRatio,
        edge = Math.min(renderer.software ? softwareEdge : maxEdge, Math.max(320, displayed));
      const ratio = Math.min(1, edge / Math.max(media.videoWidth, media.videoHeight)),
        width = Math.max(1, Math.round(media.videoWidth * ratio)),
        height = Math.max(1, Math.round(media.videoHeight * ratio));
      const resized = canvas!.width !== width || canvas!.height !== height;
      if (resized) {
        canvas!.width = width;
        canvas!.height = height;
      }
      const state = `${media.currentTime}:${media.src}`;
      if (!resized && !dirty.current && media.paused && state === shown) return;
      const { asset, edit } = latest.current;
      const { steps, crop } = gradeAt(edit, readPreviewTime(media), previewOutput(media));
      try {
        renderer.render(
          media,
          gradePasses(steps),
          { width: asset.width ?? media.videoWidth, height: asset.height ?? media.videoHeight },
          crop,
          (media.currentTime * 7.31) % 1,
        );
      } catch {
        cancelAnimationFrame(frame);
        latest.current.onFailure();
        return;
      }
      canvas!.style.opacity = media.style.opacity;
      shown = state;
      dirty.current = false;
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', lost);
      renderer.dispose();
    };
  }, [mediaRef, latest]);
  return (
    <canvas
      ref={canvasRef}
      className="graded-video"
      data-realtime-grade
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        ...style,
        pointerEvents: 'none',
      }}
    />
  );
}
