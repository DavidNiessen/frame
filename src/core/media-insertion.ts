import { editClips } from './clips';
import { allAudioLayers } from './effect-instances';
import { sourceIdentity } from './project';
import { editedDuration } from './timeline';
import { outputTimeAtSource } from './fades';
import { sequenceOffset } from './media-preparation';
import type { AudioLayer } from './audio-layers';
import type { EditSettings, MediaAsset } from './types';
export const mediaDragType = 'application/x-frame-library-media';

export function insertedAudioLayer(edit: EditSettings, source: MediaAsset, current: number, id: string = crypto.randomUUID()): AudioLayer {
  if (!source.hasAudio) throw new Error('Choose a source with audio.');
  if (allAudioLayers(edit).length >= 16) throw new Error('Use up to 16 audio layers.');
  const duration = editedDuration(edit), start = Math.min(Math.max(0, outputTimeAtSource(edit, current)), Math.max(0, duration - .05));
  return { id, role: 'music', sourceId: source.id, source: sourceIdentity(source), start, end: Math.min(duration, start + source.duration), sourceStart: 0, sourceEnd: source.duration, volume: 1, fadeIn: 0, fadeOut: 0, loop: false, muted: false };
}
/** Keep the source clock and existing output-timed effects while extending the sequence. */
export function insertedVideoEdit(base: MediaAsset, added: MediaAsset, prepared: MediaAsset, edit: EditSettings, id: string = crypto.randomUUID()) {
  const before: EditSettings = { ...structuredClone(edit), cuts: [], splits: [], clips: editClips(edit).map(clip => ({ ...structuredClone(clip), source: clip.source ?? { name: base.name, start: 0, end: base.duration } })) };
  const offset = sequenceOffset(base), end = Math.min(prepared.duration, offset + added.duration);
  const after: EditSettings = { ...before, end, clips: [...before.clips!, { id, start: offset, end, source: { name: added.name, start: offset, end }, effects: {} }] };
  return { before, after, start: offset };
}
