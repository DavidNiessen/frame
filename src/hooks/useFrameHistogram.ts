import { useEffect, useState } from 'react';
import { imageHistogram, type Histogram } from '../core/curves';
/** Sample the decoded editor frame, including TIFF proxies, without re-reading source files. */
export function useFrameHistogram() {
  const [histogram, setHistogram] = useState<Histogram | null>(null);
  useEffect(() => {
    let stale = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const frame = document.querySelector<HTMLImageElement | HTMLVideoElement>(
      '.image-canvas-frame > img, #media-preview video',
    );
    if (!frame) return;
    const sample = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (stale) return;
        const width = frame instanceof HTMLImageElement ? frame.naturalWidth : frame.videoWidth,
          height = frame instanceof HTMLImageElement ? frame.naturalHeight : frame.videoHeight;
        if (!width || !height) return;
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(512, width);
        canvas.height = Math.max(1, Math.round((height * canvas.width) / width));
        if (canvas.height > 512) {
          canvas.width = Math.max(1, Math.round((canvas.width * 512) / canvas.height));
          canvas.height = 512;
        }
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        try {
          context.drawImage(frame, 0, 0, canvas.width, canvas.height);
          setHistogram(
            imageHistogram(context.getImageData(0, 0, canvas.width, canvas.height).data),
          );
        } catch {
          setHistogram(null);
        }
      }, 120);
    };
    const observer = new MutationObserver(sample);
    observer.observe(frame, { attributes: true, attributeFilter: ['src'] });
    frame.addEventListener('load', sample);
    frame.addEventListener('seeked', sample);
    frame.addEventListener('loadeddata', sample);
    sample();
    return () => {
      stale = true;
      clearTimeout(timer);
      observer.disconnect();
      frame.removeEventListener('load', sample);
      frame.removeEventListener('seeked', sample);
      frame.removeEventListener('loadeddata', sample);
    };
  }, []);
  return histogram;
}
