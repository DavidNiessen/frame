import { definitionFor, effectiveSpeed, extraInstances } from './effect-instances';
import { timelineSections } from './timeline';
import type { EditSettings, TimeRange } from './types';
import { hasMinimumDuration } from './time-range';
import { preserveSplitFades } from './split-effects';
import type { ClipSource } from './clip-source';

export const clipEffectKeys = [
  'effectRanges',
  'effectInstances',
  'addedEffects',
  'volume',
  'speed',
  'preservePitch',
  'normalizeLoudness',
  'targetLufs',
  'reduceNoise',
  'noiseStrength',
  'noiseFloor',
  'equalizer',
  'audioFadeIn',
  'audioFadeOut',
  'videoFadeIn',
  'videoFadeOut',
  'painting',
  'retouch',
  'visual',
  'curves',
  'shape',
  'color',
  'geometry',
  'crop',
] as const;
export type ClipEffects = Partial<Pick<EditSettings, (typeof clipEffectKeys)[number]>>;
export interface TimelineClip extends TimeRange {
  id: string;
  effects: ClipEffects;
  groupId?: string;
  joinedRanges?: TimeRange[];
  source?: ClipSource;
}
export function editClips(edit: EditSettings): TimelineClip[] {
  return (
    edit.clips ??
    timelineSections(edit).map((range) => ({
      ...range,
      id: `source-${range.start}-${range.end}`,
      effects: {},
    }))
  );
}
/** Clip recipes inherit shared controls, while fades on the full output remain a final pass. */
export function clipRecipe(edit: EditSettings, clip: TimelineClip): EditSettings {
  return {
    ...edit,
    audioLayers: [],
    audioFadeIn: 0,
    audioFadeOut: 0,
    videoFadeIn: 0,
    videoFadeOut: 0,
    ...clip.effects,
    effectInstances: [
      ...extraInstances(edit).filter(
        (item) =>
          (item.timeSpace === 'output' && !item.effect.includes('Fade')) ||
          definitionFor(item.effect).scope === 'source',
      ),
      ...(
        clip.effects.effectInstances ??
        extraInstances(edit).filter(
          (item) =>
            !item.timeSpace &&
            definitionFor(item.effect).scope === 'clip' &&
            !item.effect.includes('Fade'),
        )
      ).filter((item) => !item.timeSpace),
    ],
    start: clip.start,
    end: clip.end,
    clips: undefined,
    cuts: [],
    splits: [],
  };
}
export function clipAtSource(edit: EditSettings, time: number): TimelineClip | undefined {
  return (
    editClips(edit).find((clip) => time >= clip.start && time < clip.end) ??
    editClips(edit).find((clip) => time === clip.end)
  );
}
export function clipPositions(edit: EditSettings) {
  let elapsed = 0;
  return editClips(edit).map((clip) => {
    const start = elapsed,
      speed = effectiveSpeed(clipRecipe(edit, clip));
    elapsed += (clip.end - clip.start) / speed;
    return { clip, start, end: elapsed, speed };
  });
}
export function splitClip(edit: EditSettings, id: string, time: number): Partial<EditSettings> {
  const clips = editClips(edit),
    clip = clips.find((item) => item.id === id);
  const index = clips.findIndex((item) => item.id === id);
  if (clip?.groupId && time === clip.start && clips[index - 1]?.groupId === clip.groupId) {
    const rightGroup = crypto.randomUUID();
    return {
      clips: splitJoinedRanges(
        clips.map((item, i) =>
          i >= index && item.groupId === clip.groupId ? { ...item, groupId: rightGroup } : item,
        ),
        clip.groupId,
        rightGroup,
      ),
    };
  }
  if (
    !clip ||
    !hasMinimumDuration({ start: clip.start, end: time }, effectiveSpeed(clipRecipe(edit, clip))) ||
    !hasMinimumDuration({ start: time, end: clip.end }, effectiveSpeed(clipRecipe(edit, clip)))
  )
    return {};
  const position = clipPositions(edit).find((item) => item.clip.id === id)!;
  const preserved = preserveSplitFades(edit, clip, position.start, position.speed);
  const rightGroup = clip.groupId ? crypto.randomUUID() : undefined;
  const result = clips.flatMap((item, i) =>
    item.id === id
      ? [
          { ...item, end: time, effects: preserved.effects },
          {
            ...item,
            id: crypto.randomUUID(),
            groupId: rightGroup,
            start: time,
            effects: structuredClone(preserved.effects),
          },
        ]
      : [
          item.groupId && item.groupId === clip.groupId && i > index
            ? { ...item, groupId: rightGroup }
            : item,
        ],
  );
  return {
    effectInstances: preserved.instances,
    clips: splitJoinedRanges(result, clip.groupId, rightGroup),
  };
}
function splitJoinedRanges(clips: TimelineClip[], ...groups: (string | undefined)[]) {
  // A deliberate split creates two independent restore ranges, never a shared hidden seam.
  return clips.map((clip) =>
    groups.includes(clip.groupId) && clip.groupId
      ? {
          ...clip,
          joinedRanges: clips
            .filter((item) => item.groupId === clip.groupId)
            .map(({ start, end }) => ({ start, end })),
        }
      : clip,
  );
}
export function reorderClip(edit: EditSettings, id: string, index: number): Partial<EditSettings> {
  const clips = [...editClips(edit)],
    from = clips.findIndex((clip) => clip.id === id);
  if (from < 0) return {};
  const group = clips[from].groupId,
    moving = group ? clips.filter((clip) => clip.groupId === group) : [clips[from]];
  const target = clips[Math.max(0, Math.min(clips.length - 1, index))];
  if (moving.includes(target)) return {};
  const remaining = clips.filter((clip) => !moving.includes(clip));
  let destination = remaining.indexOf(target);
  if (target.groupId) {
    const members = remaining
      .map((clip, i) => (clip.groupId === target.groupId ? i : -1))
      .filter((i) => i >= 0);
    destination = index > from ? members.at(-1)! : members[0];
  }
  remaining.splice(Math.max(0, destination + (index > from ? 1 : 0)), 0, ...moving);
  return { clips: remaining };
}
export function patchClip(
  edit: EditSettings,
  id: string,
  patch: ClipEffects,
): Partial<EditSettings> {
  const group = editClips(edit).find((clip) => clip.id === id)?.groupId;
  return {
    clips: editClips(edit).map((clip) => {
      if (clip.id !== id && (!group || clip.groupId !== group)) return clip;
      const inherited = clipRecipe(edit, { ...clip, effects: {} }),
        effects = { ...clip.effects, ...patch };
      for (const key of Object.keys(effects) as (keyof ClipEffects)[]) {
        if (
          JSON.stringify(key === 'addedEffects' ? (effects[key] ?? []) : effects[key]) ===
          JSON.stringify(key === 'addedEffects' ? (inherited[key] ?? []) : inherited[key])
        )
          delete effects[key];
      }
      return { ...clip, effects };
    }),
  };
}
