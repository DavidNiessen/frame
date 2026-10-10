import type { TimeRange } from './types';
export interface ClipSource extends TimeRange { name: string }
/** Source boundaries stop a trimmed inserted clip from revealing a neighbouring video. */
export function parseClipSource(value: unknown, duration: number, range: TimeRange): ClipSource | undefined {
  if (value === undefined) return undefined;
  const source = value as ClipSource;
  if (!source || typeof source !== 'object' || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 255 || !Number.isFinite(source.start) || !Number.isFinite(source.end) || source.start < 0 || source.end > duration + .05 || source.end <= source.start || range.start < source.start - .000001 || range.end > source.end + .000001) throw new Error('Invalid clip source boundaries.');
  return { name: source.name, start: source.start, end: source.end };
}
