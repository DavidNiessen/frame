import { outputTimeAtSource, sourceTimeAtOutput } from './fades';
import { editedDuration, keptRanges } from './timeline';
import type { EditSettings, MediaAsset, TimeRange } from './types';
export type FadeKey = 'audioFadeIn' | 'audioFadeOut' | 'videoFadeIn' | 'videoFadeOut';
export const fadeLabel = (key: FadeKey) => `${key.startsWith('audio') ? 'Audio' : 'Video'} fade ${key.endsWith('In') ? 'in' : 'out'}`;
export function fadeKeys(asset: MediaAsset): FadeKey[] {
  return [...(asset.hasAudio ? ['audioFadeIn', 'audioFadeOut'] as const : []), ...(asset.kind === 'video' ? ['videoFadeIn', 'videoFadeOut'] as const : [])];
}
export function fadeRange(edit: EditSettings, key: FadeKey): TimeRange {
  const ranges = keptRanges(edit);
  return key.endsWith('In') ? { start: ranges[0]?.start ?? edit.start, end: sourceTimeAtOutput(edit, edit[key], 'end') }
    : { start: sourceTimeAtOutput(edit, editedDuration(edit) - edit[key]), end: ranges.at(-1)?.end ?? edit.end };
}
export function resizeFade(edit: EditSettings, key: FadeKey, range: TimeRange): Partial<EditSettings> {
  const duration = editedDuration(edit);
  const value = key.endsWith('In') ? outputTimeAtSource(edit, range.end) : duration - outputTimeAtSource(edit, range.start);
  return { [key]: Math.max(0.01, Math.min(duration, value)) };
}
