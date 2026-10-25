import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { attachCutBridge } from '../core/cut-bridge';

/**
 * Shows the standby decoder for seamless cuts while it bridges one. The decoder
 * stays out of the document, so the source remains the preview's only video.
 */
export function CutBridge({
  mediaRef,
  src,
  style,
}: {
  mediaRef: RefObject<HTMLMediaElement | null>;
  src: string;
  style: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const media = mediaRef.current,
      canvas = canvasRef.current;
    if (!media || !canvas) return;
    const standby = document.createElement('video');
    standby.crossOrigin = 'anonymous';
    standby.muted = true;
    standby.playsInline = true;
    standby.preload = 'auto';
    standby.src = src;
    const detach = attachCutBridge(media, standby);
    const context = canvas.getContext('2d');
    let frame = 0;
    function paint() {
      frame = requestAnimationFrame(paint);
      const bridging = !!standby.dataset.bridging && standby.readyState >= 2;
      canvas!.style.visibility = bridging ? 'visible' : 'hidden';
      if (!bridging || !context) return;
      if (canvas!.width !== standby.videoWidth || canvas!.height !== standby.videoHeight) {
        canvas!.width = standby.videoWidth;
        canvas!.height = standby.videoHeight;
      }
      context.drawImage(standby, 0, 0);
    }
    paint();
    return () => {
      cancelAnimationFrame(frame);
      detach();
      standby.removeAttribute('src');
      standby.load();
    };
  }, [mediaRef, src]);
  return (
    <canvas
      ref={canvasRef}
      className="cut-bridge"
      data-cut-bridge
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        ...style,
        pointerEvents: 'none',
      }}
    />
  );
}
