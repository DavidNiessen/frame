import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { gradePasses, mediaLayerGrade } from '../core/realtime-grade';
import type { MediaLayer } from '../core/media-layers';
import type { MediaAsset } from '../core/types';
import { GradeRenderer } from '../engines/grade-renderer';
import { useLatest } from '../hooks/useLatest';

const maxEdge = 1920,
  softwareEdge = 960;

/**
 * Plays one video or image layer above the preview, graded on the GPU, so
 * layer edits and playback need no FFmpeg composite. Its audio is mixed with
 * the other audio tracks.
 */
export function LiveMediaLayer({
  layer,
  source,
  position,
  playing,
  box,
}: {
  layer: MediaLayer;
  source: MediaAsset;
  position: number;
  playing: boolean;
  /** The layer's box in output pixels; `mediaLayerFilters` grades at this size. */
  box: { width: number; height: number };
}) {
  const { curves, visual } = layer;
  const steps = useMemo(() => mediaLayerGrade({ curves, visual }), [curves, visual]);
  const [gradeFailed, setGradeFailed] = useState(false),
    [loaded, setLoaded] = useState(false);
  const graded = steps.length > 0 && !gradeFailed,
    video = source.kind === 'video';
  const mediaRef = useRef<HTMLVideoElement & HTMLImageElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null);
  const objectFit = layer.fit === 'stretch' ? 'fill' : layer.fit;
  const clock = layer.sourceStart + Math.max(0, position - layer.start);
  useEffect(() => {
    const media = mediaRef.current;
    if (!video || !media || !loaded) return;
    if (!playing) media.pause();
    if (Math.abs(media.currentTime - clock) > (playing ? 0.15 : 0.01)) media.currentTime = clock;
    if (playing && media.paused) void media.play().catch(() => {});
  }, [video, loaded, playing, clock]);
  const latest = useLatest({ steps, box, fit: layer.fit });
  const dirty = useRef(true);
  useEffect(() => {
    dirty.current = true;
  }, [steps, box.width, box.height, layer.fit, loaded]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!graded || !canvas) return;
    let renderer: GradeRenderer;
    try {
      renderer = new GradeRenderer(canvas, true);
    } catch {
      setGradeFailed(true);
      return;
    }
    let frame = 0,
      shown = -1;
    const lost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      setGradeFailed(true);
    };
    canvas.addEventListener('webglcontextlost', lost);
    function draw() {
      frame = requestAnimationFrame(draw);
      const media = mediaRef.current;
      if (!media) return;
      const width = video ? media.videoWidth : media.naturalWidth,
        height = video ? media.videoHeight : media.naturalHeight;
      if (!width || (video && (media.readyState < 2 || media.seeking))) return;
      const time = video ? media.currentTime : 0;
      if (!dirty.current && time === shown) return;
      const { steps, box, fit } = latest.current;
      // Kernels and the vignette follow the size the export scales the layer to.
      const fitted =
          fit === 'stretch'
            ? null
            : (fit === 'cover' ? Math.max : Math.min)(box.width / width, box.height / height),
        frameSize = fitted
          ? { width: width * fitted, height: height * fitted }
          : { width: box.width, height: box.height };
      const displayed = Math.max(canvas!.clientWidth, canvas!.clientHeight) * devicePixelRatio,
        edge = Math.min(renderer.software ? softwareEdge : maxEdge, Math.max(64, displayed)),
        ratio = Math.min(1, edge / Math.max(width, height));
      const canvasWidth = Math.max(1, Math.round(width * ratio)),
        canvasHeight = Math.max(1, Math.round(height * ratio));
      if (canvas!.width !== canvasWidth || canvas!.height !== canvasHeight) {
        canvas!.width = canvasWidth;
        canvas!.height = canvasHeight;
      }
      try {
        renderer.render(media, gradePasses(steps), frameSize, null);
        dirty.current = false;
        shown = time;
      } catch {
        cancelAnimationFrame(frame);
        setGradeFailed(true);
      }
    }
    draw();
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', lost);
      renderer.dispose();
    };
  }, [graded, video, latest]);
  const fill: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit,
  };
  const hidden: CSSProperties = graded ? { ...fill, visibility: 'hidden' } : fill;
  return (
    <>
      {video ? (
        <video
          ref={mediaRef}
          crossOrigin="anonymous"
          data-frame-mix-layer
          data-live-media-layer={layer.id}
          src={source.previewUrl}
          muted
          playsInline
          preload="auto"
          style={hidden}
          onLoadedMetadata={() => setLoaded(true)}
        />
      ) : (
        <img
          ref={mediaRef}
          crossOrigin="anonymous"
          data-live-media-layer={layer.id}
          src={source.previewUrl}
          alt=""
          draggable={false}
          style={hidden}
          onLoad={() => setLoaded(true)}
        />
      )}
      {graded && <canvas ref={canvasRef} data-layer-grade aria-hidden="true" style={fill} />}
    </>
  );
}
