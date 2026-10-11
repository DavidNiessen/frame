import {
  captionLimit,
  definitionFor,
  extraInstances,
  instanceLimit,
  newInstance,
  primaryPresent,
  type EffectInstance,
} from './effect-instances';
import { editedDuration } from './timeline';
import { outputTimeAtSource } from './fades';
import { isTimedAdjustment } from './timed-adjustments';
import type { EffectId } from './effect-ids';
import type { EditSettings, MediaAsset, TimeRange } from './types';

/** New adjustments belong to the output track, never to the clips being split. */
const isTimelineEffect = (instance: EffectInstance) => instance.timeSpace === 'output';
export const hasTimelineRange = (id: EffectId) => isTimedAdjustment(id) || id.includes('Fade');
export const clipStageEffect = (id: EffectId) => ['crop', 'transform', 'speed'].includes(id);
export function addTimelineEffect(
  edit: EditSettings,
  asset: MediaAsset,
  id: EffectId,
  current = edit.start,
): Partial<EditSettings> {
  if (
    !definitionFor(id).repeatable &&
    (primaryPresent(edit, asset, id) || extraInstances(edit, id).length)
  )
    return {};
  if (
    id === 'captions'
      ? edit.subtitles.cues.length +
          extraInstances(edit, 'captions').reduce(
            (sum, item) => sum + (item.settings.subtitles?.cues.length ?? 0),
            0,
          ) >=
        captionLimit
      : extraInstances(edit).filter((item) => item.effect !== 'captions').length >= instanceLimit
  )
    throw new Error(
      `Use up to ${id === 'captions' ? captionLimit : instanceLimit} effects per track.`,
    );
  const instance = newInstance(edit, asset, id),
    duration = editedDuration(edit);
  if (id === 'captions' || id === 'watermark') {
    const start = Math.max(0, Math.min(outputTimeAtSource(edit, current), duration - 0.05)),
      range = { start, end: Math.min(duration, start + 2) };
    if (id === 'captions')
      instance.settings.subtitles = {
        ...instance.settings.subtitles!,
        cues: instance.settings.subtitles!.cues.map((cue) => ({ ...cue, ...range })),
      };
    else instance.settings.overlays = { ...instance.settings.overlays!, range };
  }
  const present = primaryPresent(edit, asset, id) || extraInstances(edit, id).length > 0;
  let range: TimeRange | undefined;
  if (id.includes('Fade')) {
    const length = Math.min(0.5, duration / 4);
    const start = !present
      ? id.endsWith('In')
        ? 0
        : duration - length
      : Math.max(0, Math.min(outputTimeAtSource(edit, current), duration - length));
    range = { start, end: start + length };
    instance.settings = { ...instance.settings, [id]: length };
  } else if (isTimedAdjustment(id)) {
    const start = present
      ? Math.max(0, Math.min(outputTimeAtSource(edit, current), duration - 0.05))
      : 0;
    range = { start, end: present ? Math.min(duration, start + 2) : duration };
  }
  return {
    effectInstances: [...extraInstances(edit), { ...instance, timeSpace: 'output', range }],
  };
}
/** A fade is active only inside its own range; separate fades never silence each other. */
export function timelineFadeGain(instance: EffectInstance, time: number): number {
  const range = instance.range;
  if (
    !range ||
    time < range.start ||
    time >= range.end ||
    !instance.settings[instance.effect as 'audioFadeOut']
  )
    return 1;
  const fraction = (time - range.start) / (range.end - range.start);
  return instance.effect.endsWith('In') ? fraction : 1 - fraction;
}
export function timelineFadeFilter(instance: EffectInstance): string[] {
  const range = instance.range;
  if (!range || !instance.settings[instance.effect as 'audioFadeOut']) return [];
  const filter = instance.effect.startsWith('audio') ? 'afade' : 'fade';
  return [
    `${filter}=t=${instance.effect.endsWith('In') ? 'in' : 'out'}:st=${range.start}:d=${range.end - range.start}:enable='gte(t,${range.start})*lt(t,${range.end})'`,
  ];
}
export function fitTimelineRange(range: TimeRange, duration: number): TimeRange {
  const length = Math.min(range.end - range.start, duration),
    start = Math.max(0, Math.min(range.start, duration - length));
  return { start, end: start + length };
}
export function fitTimelineEffects(edit: EditSettings): EffectInstance[] {
  const duration = editedDuration(edit);
  return extraInstances(edit).map((instance) => {
    if (!isTimelineEffect(instance)) return instance;
    const range = instance.range ? fitTimelineRange(instance.range, duration) : undefined;
    const settings = { ...instance.settings };
    if (range && instance.effect.includes('Fade') && settings[instance.effect as 'audioFadeOut'])
      Object.assign(settings, { [instance.effect]: range.end - range.start });
    if (settings.subtitles)
      settings.subtitles = {
        ...settings.subtitles,
        cues: settings.subtitles.cues.map((cue) => ({
          ...cue,
          ...fitTimelineRange(cue, duration),
        })),
      };
    if (settings.overlays?.range)
      settings.overlays = {
        ...settings.overlays,
        range: fitTimelineRange(settings.overlays.range, duration),
      };
    return { ...instance, ...(range ? { range } : {}), settings };
  });
}
export function timelineEffectRows(edit: EditSettings) {
  const counts = new Map<EffectId, number>();
  return extraInstances(edit)
    .filter(
      (instance) => isTimelineEffect(instance) && definitionFor(instance.effect).scope === 'clip',
    )
    .map((instance) => {
      const ordinal = (counts.get(instance.effect) ?? 0) + 1;
      counts.set(instance.effect, ordinal);
      return { instance, ordinal, effect: definitionFor(instance.effect) };
    });
}
