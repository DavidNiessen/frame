import { effectiveSpeed, effectiveVolume, extraInstances } from '../core/effect-instances';
import { useEffect, useRef, type RefObject } from 'react';
import { clipAtSource, clipRecipe, editClips } from '../core/clips';
import { fadeGain, outputTimeAtSource } from '../core/fades';
import { editedDuration, nextPlayableTime, keptRanges } from '../core/timeline';
import type { EditSettings } from '../core/types';
export function pauseOtherMedia(active: HTMLMediaElement) {
  for (const element of document.querySelectorAll('video, audio')) if (element !== active && !element.hasAttribute('data-frame-mix-layer')) (element as HTMLMediaElement).pause();
}
export function applyPreviewEffects(media: HTMLMediaElement, edit: EditSettings) {
  const position = outputTimeAtSource(edit, media.currentTime); const duration = editedDuration(edit);
  const clip = edit.clips ? clipAtSource(edit, media.currentTime) : undefined, recipe = clip ? clipRecipe(edit, clip) : edit;
  const speed = effectiveSpeed(recipe), local = (media.currentTime - recipe.start) / speed;
  const localFade = clip ? fadeGain(local, editedDuration(recipe), recipe.audioFadeIn, recipe.audioFadeOut) : 1;
  if (media.playbackRate !== speed) media.playbackRate = Math.min(16, Math.max(.0625, speed));
  media.preservesPitch = recipe.preservePitch && extraInstances(recipe, 'speed').every(instance => instance.settings.preservePitch !== false);
  const additionalFade = (kind: 'audio' | 'video') => extraInstances(recipe).filter(instance => instance.effect.startsWith(`${kind}Fade`)).reduce((gain, instance) => gain * fadeGain(local, editedDuration(recipe), instance.settings[`${kind}FadeIn`] ?? 0, instance.settings[`${kind}FadeOut`] ?? 0), 1);
  const sharedFade = (kind: 'audio' | 'video') => clip ? extraInstances(edit).filter(instance => instance.effect.startsWith(`${kind}Fade`)).reduce((gain, instance) => gain * fadeGain(position, duration, instance.settings[`${kind}FadeIn`] ?? 0, instance.settings[`${kind}FadeOut`] ?? 0), 1) : 1;
  media.volume = Math.min(1, effectiveVolume(recipe) * sharedFade('audio') * additionalFade('audio') * localFade * fadeGain(position, duration, edit.audioFadeIn, edit.audioFadeOut));
  if (media.tagName === 'VIDEO') media.style.opacity = String(sharedFade('video') * additionalFade('video') * fadeGain(position, duration, edit.videoFadeIn, edit.videoFadeOut) * (clip ? fadeGain(local, editedDuration(recipe), recipe.videoFadeIn, recipe.videoFadeOut) : 1));
}
export function usePreviewEffects(ref: RefObject<HTMLMediaElement | null>, edit: EditSettings, playing: boolean,
  current: number, assetId: string, publish: (time: number) => void, loop = false) {
  const latest = useRef({ edit, publish, loop }); latest.current = { edit, publish, loop };
  useEffect(() => {
    if (!playing && ref.current) applyPreviewEffects(ref.current, edit);
  }, [ref, edit, playing, current, assetId]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, playingClip: string | null = null;
    const media = ref.current;
    const seeking = () => { playingClip = null; };
    media?.addEventListener('seeking', seeking);
    function tick() {
      const media = ref.current;
      if (!media || media.paused) return;
      const { edit: recipe, publish: updateClock } = latest.current;
      const clips = editClips(recipe);
      let index = clips.findIndex(clip => clip.id === playingClip);
      if (index < 0 || media.currentTime < clips[index].start) index = clips.findIndex(clip => media.currentTime >= clip.start && media.currentTime < clip.end);
      if (index < 0) index = 0;
      playingClip = clips[index].id;
      let next: number | null;
      if (recipe.clips) {
        next = media.currentTime >= clips[index].end - .015 ? clips[index + 1]?.start ?? null : media.currentTime;
        if (next !== null && next !== media.currentTime) playingClip = clips[index + 1]?.id ?? null;
      } else next = nextPlayableTime(recipe, media.currentTime);
      if (next === null) { if (!latest.current.loop) media.pause(); media.currentTime = keptRanges(recipe)[0]?.start ?? recipe.start; playingClip = null; }
      else if (next !== media.currentTime) media.currentTime = next;
      applyPreviewEffects(media, recipe);
      updateClock(media.currentTime);
      if (!media.paused) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); media?.removeEventListener('seeking', seeking); };
  }, [ref, playing, assetId]);
}
