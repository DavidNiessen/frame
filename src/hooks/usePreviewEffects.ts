import { effectiveSpeed, effectiveVolume, extraInstances } from '../core/effect-instances';
import { useEffect, useRef, type RefObject } from 'react';
import { clipAtSource, clipRecipe } from '../core/clips';
import { fadeGain, outputTimeAtSource } from '../core/fades';
import { timelineFadeGain } from '../core/timeline-effects';
import { editedDuration, keptRanges } from '../core/timeline';
import { previewPlaybackStep } from '../core/preview-playback';
import type { EditSettings } from '../core/types';
import { hasPreviewClock, readPreviewTime, seekPreviewTime } from '../core/preview-clock';
export function pauseOtherMedia(active: HTMLMediaElement) {
  for (const element of document.querySelectorAll('video, audio')) if (element !== active && !element.hasAttribute('data-frame-mix-layer')) (element as HTMLMediaElement).pause();
}
export function applyPreviewEffects(media: HTMLMediaElement, edit: EditSettings) {
  const sourceTime = readPreviewTime(media), position = outputTimeAtSource(edit, sourceTime); const duration = editedDuration(edit);
  const clip = edit.clips ? clipAtSource(edit, sourceTime) : undefined, recipe = clip ? clipRecipe(edit, clip) : edit;
  const speed = effectiveSpeed(recipe), local = (sourceTime - recipe.start) / speed;
  const localFade = clip ? fadeGain(local, editedDuration(recipe), recipe.audioFadeIn, recipe.audioFadeOut) : 1;
  if (media.playbackRate !== speed) media.playbackRate = Math.min(16, Math.max(.0625, speed));
  media.preservesPitch = recipe.preservePitch && extraInstances(recipe, 'speed').every(instance => instance.settings.preservePitch !== false);
  const additionalFade = (kind: 'audio' | 'video') => extraInstances(recipe).filter(instance => !instance.timeSpace && instance.effect.startsWith(`${kind}Fade`)).reduce((gain, instance) => gain * fadeGain(local, editedDuration(recipe), instance.settings[`${kind}FadeIn`] ?? 0, instance.settings[`${kind}FadeOut`] ?? 0), 1);
  const sharedFade = (kind: 'audio' | 'video') => extraInstances(edit).filter(instance => instance.effect.startsWith(`${kind}Fade`) && (clip || instance.timeSpace)).reduce((gain, instance) => gain * (instance.timeSpace === 'output' ? timelineFadeGain(instance, position) : fadeGain(position, duration, instance.settings[`${kind}FadeIn`] ?? 0, instance.settings[`${kind}FadeOut`] ?? 0)), 1);
  media.volume = Math.min(1, effectiveVolume(recipe, sourceTime, position) * sharedFade('audio') * additionalFade('audio') * localFade * fadeGain(position, duration, edit.audioFadeIn, edit.audioFadeOut));
  if (media.tagName === 'VIDEO') media.style.opacity = String(sharedFade('video') * additionalFade('video') * fadeGain(position, duration, edit.videoFadeIn, edit.videoFadeOut) * (clip ? fadeGain(local, editedDuration(recipe), recipe.videoFadeIn, recipe.videoFadeOut) : 1));
}
export function usePreviewEffects(ref: RefObject<HTMLMediaElement | null>, edit: EditSettings, playing: boolean,
  current: number, assetId: string, publish: (time: number) => void, loop = false, effects = edit) {
  const latest = useRef({ edit, publish, loop, effects }); latest.current = { edit, publish, loop, effects };
  useEffect(() => {
    if (!playing && ref.current) applyPreviewEffects(ref.current, effects);
  }, [ref, effects, playing, current, assetId]);
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
      const sourceTime = readPreviewTime(media);
      const step = previewPlaybackStep(recipe, sourceTime, playingClip, hasPreviewClock(media));
      const next = step.time; playingClip = step.clipId;
      if (next === null) { if (!latest.current.loop) media.pause(); seekPreviewTime(media, keptRanges(recipe)[0]?.start ?? recipe.start); playingClip = null; }
      else if (next !== sourceTime) seekPreviewTime(media, next);
      applyPreviewEffects(media, latest.current.effects);
      updateClock(readPreviewTime(media));
      if (!media.paused) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); media?.removeEventListener('seeking', seeking); };
  }, [ref, playing, assetId]);
}
