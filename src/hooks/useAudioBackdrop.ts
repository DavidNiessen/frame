import { useEffect, type RefObject } from 'react';
import { monitorVolume } from '../core/monitor-volume';
import { playbackAudio, startPlaybackAudio } from '../core/realtime-audio';

/** Meter the playing signal without changing its gain or the export recipe. */
export function useAudioBackdrop(
  mediaRef: RefObject<HTMLMediaElement | null>,
  backdrop: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  assetId: string,
) {
  useEffect(() => {
    const media = mediaRef.current,
      element = backdrop.current;
    if (!enabled || !media || !element || !window.AudioContext) return;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let active = true,
      frame = 0,
      level = 0,
      bass = 0;
    let input: ReturnType<typeof playbackAudio>;
    const samples = new Float32Array(512),
      spectrum = new Uint8Array(256);
    function paint() {
      if (!active || !input) return;
      let next = 0,
        low = 0;
      if (!media!.paused && !media!.ended && !reducedMotion.matches) {
        input.analyser.getFloatTimeDomainData(samples);
        input.analyser.getByteFrequencyData(spectrum);
        next =
          Math.min(
            1,
            Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) * 4,
          ) * monitorVolume();
        low =
          Math.min(1, spectrum.slice(1, 9).reduce((sum, value) => sum + value, 0) / (8 * 255)) *
          monitorVolume();
      }
      level += (next - level) * (next > level ? 0.18 : 0.07);
      bass += (low - bass) * 0.12;
      element!.style.setProperty('--audio-level', level.toFixed(4));
      element!.style.setProperty('--audio-bass', bass.toFixed(4));
      if (!media!.paused || level > 0.001 || bass > 0.001) frame = requestAnimationFrame(paint);
      else frame = 0;
    }
    async function start() {
      if (!active || reducedMotion.matches) return;
      try {
        input = await startPlaybackAudio(media!, () => active);
        if (!active || !input) return;
        if (!frame) frame = requestAnimationFrame(paint);
      } catch {
        /* Unsupported sources keep their normal player background. */
      }
    }
    media.addEventListener('playing', start);
    if (!media.paused) void start();
    return () => {
      active = false;
      media.removeEventListener('playing', start);
      cancelAnimationFrame(frame);
      element.style.removeProperty('--audio-level');
      element.style.removeProperty('--audio-bass');
    };
  }, [mediaRef, backdrop, enabled, assetId]);
}
