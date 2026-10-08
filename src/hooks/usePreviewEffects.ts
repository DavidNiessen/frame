import { useEffect, type RefObject } from 'react';
import { fadeGain, outputTimeAtSource } from '../core/fades';
import { editedDuration } from '../core/timeline';
import type { EditSettings } from '../core/types';
export function pauseOtherMedia(active: HTMLMediaElement) {
  for (const element of document.querySelectorAll('video, audio')) if (element !== active) (element as HTMLMediaElement).pause();
}
export function applyPreviewEffects(media: HTMLMediaElement, edit: EditSettings) {
  const position = outputTimeAtSource(edit, media.currentTime); const duration = editedDuration(edit);
  media.volume = Math.min(1, edit.volume * fadeGain(position, duration, edit.audioFadeIn, edit.audioFadeOut));
  if (media.playbackRate !== edit.speed) media.playbackRate = edit.speed;
  media.preservesPitch = edit.preservePitch;
  if (media.tagName === 'VIDEO') media.style.opacity = String(fadeGain(position, duration, edit.videoFadeIn, edit.videoFadeOut));
}
export function usePreviewEffects(ref: RefObject<HTMLMediaElement | null>, edit: EditSettings, playing: boolean, current: number, assetId: string) {
  useEffect(() => {
    let frame = 0;
    const apply = () => { if (ref.current) applyPreviewEffects(ref.current, edit); if (playing) frame = requestAnimationFrame(apply); };
    apply(); return () => cancelAnimationFrame(frame);
  }, [ref, edit, playing, current, assetId]);
}
