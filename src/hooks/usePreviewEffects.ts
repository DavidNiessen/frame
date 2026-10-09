import { useEffect, useRef, type RefObject } from 'react';
import { fadeGain, outputTimeAtSource } from '../core/fades';
import { editedDuration, nextPlayableTime, keptRanges } from '../core/timeline';
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
export function usePreviewEffects(ref: RefObject<HTMLMediaElement | null>, edit: EditSettings, playing: boolean,
  current: number, assetId: string, publish: (time: number) => void) {
  const latest = useRef({ edit, publish }); latest.current = { edit, publish };
  useEffect(() => {
    if (!playing && ref.current) applyPreviewEffects(ref.current, edit);
  }, [ref, edit, playing, current, assetId]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    function tick() {
      const media = ref.current;
      if (!media || media.paused) return;
      const { edit: recipe, publish: updateClock } = latest.current;
      const next = nextPlayableTime(recipe, media.currentTime);
      if (next === null) { media.pause(); media.currentTime = keptRanges(recipe)[0]?.start ?? recipe.start; }
      else if (next !== media.currentTime) media.currentTime = next;
      applyPreviewEffects(media, recipe);
      updateClock(media.currentTime);
      if (!media.paused) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ref, playing, assetId]);
}
