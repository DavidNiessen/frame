import { captionLimit, extraInstances, type EffectInstance } from './effect-instances';
import { parseSubtitles, type Subtitles } from './subtitles';
import type { EditSettings } from './types';

/** Upgrade grouped captions without changing their timing, placement or export mode. */
export function individualCaptionEffects(edit: EditSettings): EditSettings {
  if (
    edit.subtitles.cues.length <= 1 &&
    extraInstances(edit, 'captions').every(
      (instance) => (instance.settings.subtitles?.cues.length ?? 0) <= 1,
    )
  )
    return edit;
  const split = (subtitles: Subtitles, timeSpace?: 'output'): EffectInstance[] =>
    subtitles.cues.slice(1).map((cue) => ({
      id: crypto.randomUUID(),
      effect: 'captions',
      ...(timeSpace ? { timeSpace } : {}),
      settings: { subtitles: { mode: subtitles.mode, cues: [cue] } },
    }));
  return {
    ...edit,
    subtitles: { ...edit.subtitles, cues: edit.subtitles.cues.slice(0, 1) },
    effectInstances: [
      ...split(edit.subtitles),
      ...extraInstances(edit).flatMap((instance) => {
        const subtitles = instance.effect === 'captions' ? instance.settings.subtitles : undefined;
        return subtitles
          ? [
              {
                ...instance,
                settings: { subtitles: { ...subtitles, cues: subtitles.cues.slice(0, 1) } },
              },
              ...split(subtitles, instance.timeSpace),
            ]
          : [instance];
      }),
    ],
  };
}

/** Import is additive: every cue gets its own effect, preserving existing captions. */
export function importCaptionEffects(edit: EditSettings, value: Subtitles): Partial<EditSettings> {
  const subtitles = parseSubtitles(value),
    current = individualCaptionEffects(edit);
  const count =
    current.subtitles.cues.length +
    extraInstances(current, 'captions').reduce(
      (sum, instance) => sum + (instance.settings.subtitles?.cues.length ?? 0),
      0,
    );
  if (count + subtitles.cues.length > captionLimit)
    throw new Error(`Use up to ${captionLimit.toLocaleString('en-US')} captions per source.`);
  const primary = !current.subtitles.cues.length ? subtitles.cues[0] : undefined;
  return {
    subtitles: primary ? { mode: subtitles.mode, cues: [primary] } : current.subtitles,
    addedEffects: [...new Set([...(current.addedEffects ?? []), 'captions' as const])],
    effectInstances: [
      ...extraInstances(current),
      ...subtitles.cues.slice(primary ? 1 : 0).map((cue) => ({
        id: crypto.randomUUID(),
        effect: 'captions' as const,
        settings: { subtitles: { mode: subtitles.mode, cues: [cue] } },
      })),
    ],
  };
}

export const resetCaption = (subtitles: Subtitles): Subtitles => ({
  mode: 'burn',
  cues: subtitles.cues.map((cue) => ({ start: cue.start, end: cue.end, text: 'New caption' })),
});
