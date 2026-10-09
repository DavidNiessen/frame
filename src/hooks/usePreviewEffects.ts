import { useEffect, useRef, type RefObject } from 'react';
import { clipAtSource, clipRecipe, editClips } from '../core/clips';
import { fadeGain, outputTimeAtSource } from '../core/fades';
import { editedDuration, nextPlayableTime, keptRanges } from '../core/timeline';
import type { EditSettings } from '../core/types';
export function pauseOtherMedia(active: HTMLMediaElement) {
  for (const element of document.querySelectorAll('video, audio')) if (element !== active) (element as HTMLMediaElement).pause();
}
export function applyPreviewEffects(media: HTMLMediaElement, edit: EditSettings) {
  const position = outputTimeAtSource(edit, media.currentTime); const duration = editedDuration(edit);
  const clip = edit.clips ? clipAtSource(edit, media.currentTime) : undefined, recipe = clip ? clipRecipe(edit, clip) : edit;
  const local = (media.currentTime - recipe.start) / recipe.speed;
  const localFade = clip ? fadeGain(local, editedDuration(recipe), recipe.audioFadeIn, recipe.audioFadeOut) : 1;
  media.volume = Math.min(1, recipe.volume * localFade * fadeGain(position, duration, edit.audioFadeIn, edit.audioFadeOut));
  if (media.playbackRate !== recipe.speed) media.playbackRate = recipe.speed;
  media.preservesPitch = recipe.preservePitch;
  if (media.tagName === 'VIDEO') media.style.opacity = String(fadeGain(position, duration, edit.videoFadeIn, edit.videoFadeOut) * (clip ? fadeGain(local, editedDuration(recipe), recipe.videoFadeIn, recipe.videoFadeOut) : 1));
}
export function usePreviewEffects(ref: RefObject<HTMLMediaElement | null>, edit: EditSettings, playing: boolean,
  current: number, assetId: string, publish: (time: number) => void) {
  const latest = useRef({ edit, publish }); latest.current = { edit, publish };
  useEffect(() => {
    if (!playing && ref.current) applyPreviewEffects(ref.current, edit);
  }, [ref, edit, playing, current, assetId]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, playingClip: string | null = null;
    function tick() {
      const media = ref.current;
      if (!media || media.paused) return;
      const { edit: recipe, publish: updateClock } = latest.current;
      const clips = editClips(recipe);
      let index = clips.findIndex(clip => clip.id === playingClip);
      if (index < 0 || media.currentTime < clips[index].start || media.currentTime > clips[index].end + .04) index = clips.findIndex(clip => media.currentTime >= clip.start && media.currentTime < clip.end);
      if (index < 0) index = 0;
      playingClip = clips[index].id;
      let next: number | null;
      if (recipe.clips) {
        next = media.currentTime >= clips[index].end - .015 ? clips[index + 1]?.start ?? null : media.currentTime;
        if (next !== null && next !== media.currentTime) playingClip = clips[index + 1]?.id ?? null;
      } else next = nextPlayableTime(recipe, media.currentTime);
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
