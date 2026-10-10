import { clipGroups } from './clip-groups';
import { clipPositions, editClips, splitClip, type TimelineClip } from './clips';
import { allAudioLayers, captionLimit, definitionFor, extraInstances, instanceLimit, type EffectInstance } from './effect-instances';
import type { AudioLayer } from './audio-layers';
import { availableEffects } from './effect-library';
import { editedDuration } from './timeline';
import { fitTimelineRange } from './timeline-effects';
import { minimumSourceDuration } from './time-range';
import type { EditSettings, MediaAsset } from './types';
export type TimelineClipboard = { kind: 'clips'; assetId: string; clips: TimelineClip[] }
  | { kind: 'effect'; instance: EffectInstance } | { kind: 'audio'; layer: AudioLayer };
export function copySection(edit: EditSettings, assetId: string, id: string): TimelineClipboard | undefined {
  const group = clipGroups(edit).find(group => group.clips.some(clip => clip.id === id));
  return group ? { kind: 'clips', assetId, clips: structuredClone(group.clips) } : undefined;
}
export function clipboardUnavailable(value: TimelineClipboard | null, edit: EditSettings, asset: MediaAsset): string | undefined {
  if (!value) return 'Copy an item first.';
  if (value.kind === 'clips') return value.assetId !== asset.id ? 'Sections can be pasted into their original source. Use Insert for other media.' : editClips(edit).length + value.clips.length + 1 > 1000 ? 'The timeline supports up to 1,000 pieces.' : undefined;
  if (value.kind === 'audio') return allAudioLayers(edit).length >= 16 ? 'Use up to 16 audio layers.' : undefined;
  const effect = definitionFor(value.instance.effect);
  if (!effect.repeatable || !availableEffects(asset).some(item => item.id === effect.id)) return 'This effect cannot be duplicated on this source.';
  if (effect.id === 'captions') {
    const count = edit.subtitles.cues.length + extraInstances(edit, 'captions').reduce((sum, item) => sum + (item.settings.subtitles?.cues.length ?? 0), 0);
    return count >= captionLimit ? 'The caption limit has been reached.' : undefined;
  }
  return extraInstances(edit).filter(item => item.effect !== 'captions').length >= instanceLimit ? 'The effect limit has been reached.' : undefined;
}
/** Insert retained footage, not its discarded gaps, and never share IDs or mutable settings. */
export function pasteTimeline(value: TimelineClipboard, edit: EditSettings, asset: MediaAsset, output: number): { patch: Partial<EditSettings>; id: string; output: number } {
  const reason = clipboardUnavailable(value, edit, asset); if (reason) throw new Error(reason);
  const duration = editedDuration(edit), at = Math.max(0, Math.min(duration, output));
  if (value.kind === 'clips') {
    let next = edit;
    const target = clipPositions(edit).find(position => at >= position.start && at < position.end);
    let insertionTime = at;
    if (target) {
      const minimum = minimumSourceDuration(target.speed) / target.speed;
      const patch = splitClip(edit, target.clip.id, target.clip.start + (at - target.start) * target.speed);
      if (patch.clips && (at >= target.start + minimum && at <= target.end - minimum || at === target.start)) next = { ...edit, ...patch };
      else {
        const group = clipGroups(edit).find(group => group.clips.includes(target.clip))!;
        insertionTime = at - group.start < group.end - at ? group.start : group.end;
      }
    }
    const positions = clipPositions(next), index = positions.findIndex(position => insertionTime <= position.start + .000001);
    const insertion = index < 0 ? positions.length : index, clips = [...editClips(next)];
    const groupId = value.clips.length > 1 ? crypto.randomUUID() : undefined;
    const copies = structuredClone(value.clips).map(clip => ({ ...clip, id: crypto.randomUUID(), groupId,
      effects: { ...clip.effects, ...(clip.effects.effectInstances ? { effectInstances: clip.effects.effectInstances.map(instance => ({ ...instance, id: crypto.randomUUID() })) } : {}) } }));
    clips.splice(insertion, 0, ...copies);
    return { patch: { clips, effectInstances: next.effectInstances, start: Math.min(...clips.map(clip => clip.start)), end: Math.max(...clips.map(clip => clip.end)), cuts: [], splits: [] }, id: copies[0].id, output: positions[insertion]?.start ?? duration };
  }
  if (value.kind === 'audio') {
    const layer = structuredClone(value.layer), range = fitTimelineRange({ start: at, end: at + layer.end - layer.start }, duration);
    Object.assign(layer, range, { id: crypto.randomUUID(), fadeIn: Math.min(layer.fadeIn, range.end - range.start), fadeOut: Math.min(layer.fadeOut, range.end - range.start) });
    return { patch: { audioLayers: [...(edit.audioLayers ?? []), layer] }, id: layer.id, output: range.start };
  }
  const instance = structuredClone(value.instance), settings = instance.settings;
  instance.id = crypto.randomUUID(); instance.timeSpace = 'output';
  const shift = (range: { start: number; end: number }) => fitTimelineRange({ start: at, end: at + range.end - range.start }, duration);
  if (instance.range) instance.range = shift(instance.range);
  if (settings.subtitles) settings.subtitles.cues = settings.subtitles.cues.map(cue => ({ ...cue, ...shift(cue) }));
  if (settings.overlays?.range) settings.overlays.range = shift(settings.overlays.range);
  if (instance.range && instance.effect.includes('Fade')) Object.assign(settings, { [instance.effect]: instance.range.end - instance.range.start });
  return { patch: { effectInstances: [...extraInstances(edit), instance] }, id: instance.id, output: instance.range?.start ?? settings.subtitles?.cues[0]?.start ?? settings.overlays?.range?.start ?? at };
}
