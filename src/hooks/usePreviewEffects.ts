import { monitorVolume } from '../core/monitor-volume';
import { useMonitorVolume } from './useMonitorVolume';
import { effectiveSpeed, effectiveVolume, extraInstances } from '../core/effect-instances';
import { useEffect, useRef, type RefObject } from 'react';
import { clipAtSource, clipRecipe, clipPositions, editClips } from '../core/clips';
import { bridgingCut, crossCut, cutLookahead, prepareCut } from '../core/cut-bridge';
import { fadeGain, outputTimeAtSource } from '../core/fades';
import { timelineFadeGain } from '../core/timeline-effects';
import { editedDuration, keptRanges } from '../core/timeline';
import { previewPlaybackStep } from '../core/preview-playback';
import type { EditSettings } from '../core/types';
import {
  hasPreviewClock,
  previewOutput,
  readPreviewTime,
  seekPreviewTime,
} from '../core/preview-clock';
import { previewFrameLoop } from './preview-frame-loop';
import { realtimeEqualizers, realtimeNoise, updatePlaybackAudio } from '../core/realtime-audio';
import { reducesNoise } from '../core/effect-preview';
export function pauseOtherMedia(active: HTMLMediaElement) {
  for (const element of document.querySelectorAll('video, audio'))
    if (element !== active && !element.hasAttribute('data-frame-mix-layer'))
      (element as HTMLMediaElement).pause();
}
export function applyPreviewEffects(media: HTMLMediaElement, edit: EditSettings) {
  const sourceTime = readPreviewTime(media),
    position = outputTimeAtSource(edit, sourceTime, previewOutput(media));
  const duration = editedDuration(edit);
  const clip = edit.clips
      ? (clipPositions(edit).find((item) => position >= item.start && position < item.end)?.clip ??
        clipAtSource(edit, sourceTime))
      : undefined,
    recipe = clip ? clipRecipe(edit, clip) : edit;
  const speed = effectiveSpeed(recipe),
    local = (sourceTime - recipe.start) / speed;
  const localFade = clip
    ? fadeGain(local, editedDuration(recipe), recipe.audioFadeIn, recipe.audioFadeOut)
    : 1;
  const rendered = media.dataset.previewEffects === 'rendered',
    rate = rendered ? 1 : Math.min(16, Math.max(0.0625, speed));
  // A bridged cut briefly runs the hidden source at its own rate.
  if (media.playbackRate !== rate && !bridgingCut(media)) media.playbackRate = rate;
  media.preservesPitch =
    rendered ||
    (recipe.preservePitch &&
      extraInstances(recipe, 'speed').every(
        (instance) => instance.settings.preservePitch !== false,
      ));
  const additionalFade = (kind: 'audio' | 'video') =>
    extraInstances(recipe)
      .filter((instance) => !instance.timeSpace && instance.effect.startsWith(`${kind}Fade`))
      .reduce(
        (gain, instance) =>
          gain *
          fadeGain(
            local,
            editedDuration(recipe),
            instance.settings[`${kind}FadeIn`] ?? 0,
            instance.settings[`${kind}FadeOut`] ?? 0,
          ),
        1,
      );
  const sharedFade = (kind: 'audio' | 'video') =>
    extraInstances(edit)
      .filter(
        (instance) => instance.effect.startsWith(`${kind}Fade`) && (clip || instance.timeSpace),
      )
      .reduce(
        (gain, instance) =>
          gain *
          (instance.timeSpace === 'output'
            ? timelineFadeGain(instance, position)
            : fadeGain(
                position,
                duration,
                instance.settings[`${kind}FadeIn`] ?? 0,
                instance.settings[`${kind}FadeOut`] ?? 0,
              )),
        1,
      );
  const gain = rendered
    ? 1
    : effectiveVolume(recipe, sourceTime, position) *
      sharedFade('audio') *
      additionalFade('audio') *
      localFade *
      fadeGain(position, duration, edit.audioFadeIn, edit.audioFadeOut);
  // A separately rendered soundtrack plays beside the video, so the source stays silent.
  const audible = media.dataset.previewAudio !== 'separate';
  const live = !rendered && audible;
  const realtime = updatePlaybackAudio(
    media,
    live ? realtimeEqualizers(recipe, sourceTime, position) : [],
    audible ? gain : 0,
    live && reducesNoise(edit) ? realtimeNoise(recipe, sourceTime, position) : null,
  );
  media.volume = audible ? monitorVolume() * (realtime ? 1 : Math.min(1, gain)) : 0;
  if (media.tagName === 'VIDEO')
    media.style.opacity = String(
      sharedFade('video') *
        additionalFade('video') *
        fadeGain(position, duration, edit.videoFadeIn, edit.videoFadeOut) *
        (clip
          ? fadeGain(local, editedDuration(recipe), recipe.videoFadeIn, recipe.videoFadeOut)
          : 1),
    );
}
export function usePreviewEffects(
  ref: RefObject<HTMLMediaElement | null>,
  edit: EditSettings,
  playing: boolean,
  current: number,
  assetId: string,
  publish: (time: number) => void,
  loop = false,
  effects = edit,
) {
  const monitoring = useMonitorVolume();
  const latest = useRef({ edit, publish, loop, effects });
  latest.current = { edit, publish, loop, effects };
  useEffect(() => {
    if (!playing && ref.current) applyPreviewEffects(ref.current, effects);
  }, [ref, effects, playing, current, assetId, monitoring]);
  useEffect(() => {
    let playingClip: string | null = null;
    const media = ref.current;
    if (!media) return;
    const seeking = () => {
      playingClip = null;
    };
    media?.addEventListener('seeking', seeking);
    function tick() {
      const media = ref.current;
      if (!media || !media.readyState || media.dataset.previewSwitching) return;
      const { edit: recipe, publish: updateClock } = latest.current;
      const sourceTime = readPreviewTime(media),
        clock = hasPreviewClock(media),
        positions = recipe.clips && !clock ? clipPositions(latest.current.effects) : null;
      // Repeated footage shares source times: resume the occurrence being shown.
      const shown = previewOutput(media);
      if (!playingClip && positions && shown !== undefined)
        playingClip =
          positions.find(
            ({ clip, start, end }) =>
              shown >= start - 1e-3 &&
              shown < end &&
              sourceTime >= clip.start &&
              sourceTime < clip.end,
          )?.clip.id ?? null;
      const step = previewPlaybackStep(
        recipe,
        sourceTime,
        playingClip,
        clock && !media.dataset.previewStale,
      );
      const next = step.time;
      playingClip = step.clipId;
      if (next === null) {
        if (!latest.current.loop) media.pause();
        seekPreviewTime(media, keptRanges(recipe)[0]?.start ?? recipe.start);
        playingClip = null;
      } else if (next !== sourceTime)
        seekPreviewTime(media, positions ? crossCut(media, next) : next);
      const playingAt = positions?.find(({ clip }) => clip.id === step.clipId);
      if (playingAt && next !== null && !media.paused) {
        // Cue the standby decoder on the clip after the next jump.
        const clips = editClips(recipe),
          index = clips.findIndex((clip) => clip.id === step.clipId),
          following = clips[index + 1];
        if (
          following &&
          Math.abs(following.start - clips[index].end) > 1e-6 &&
          clips[index].end - next < cutLookahead * media.playbackRate
        )
          prepareCut(media, following.start);
      }
      if (playingAt && next !== null)
        media.dataset.previewOutput = String(
          playingAt.start + (next - playingAt.clip.start) / playingAt.speed,
        );
      applyPreviewEffects(media, latest.current.effects);
      updateClock(readPreviewTime(media));
    }
    const stop = previewFrameLoop(media, tick);
    return () => {
      stop();
      media.removeEventListener('seeking', seeking);
    };
  }, [ref, assetId]);
}
