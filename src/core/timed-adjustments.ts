import { visualIds } from './visual-settings';
import type { EffectId } from './effect-ids';
import type { EditSettings, TimeRange } from './types';
import { outputCues } from './subtitles';

const timedAdjustments = [
  'volume',
  'equalizer',
  'noise',
  'color',
  'curves',
  'painting',
  ...visualIds,
] as const;
export type TimedAdjustment = (typeof timedAdjustments)[number];
export type EffectRanges = Partial<Record<TimedAdjustment, TimeRange>>;
export const isTimedAdjustment = (id: EffectId): id is TimedAdjustment =>
  (timedAdjustments as readonly string[]).includes(id);
export function parseEffectRange(value: unknown): TimeRange | undefined {
  if (value === undefined) return undefined;
  const r = value as TimeRange;
  if (
    !r ||
    !Number.isFinite(r.start) ||
    !Number.isFinite(r.end) ||
    r.start < 0 ||
    r.end <= r.start ||
    r.end > 86400
  )
    throw new Error('Invalid effect timing.');
  return { start: r.start, end: r.end };
}
export function parseEffectRanges(value: unknown): EffectRanges | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid effect timing.');
  return Object.fromEntries(
    Object.entries(value).map(([id, range]) => {
      if (!isTimedAdjustment(id as EffectId) || range === undefined)
        throw new Error('This effect cannot have an independent time range.');
      return [id, parseEffectRange(range)];
    }),
  );
}
export const activeAtSource = (range: TimeRange | undefined, time: number | undefined) =>
  time === undefined || !range || (time >= range.start && time < range.end);
/** Effects follow source content through trim, cuts, reordered clips and speed changes. */
export function adjustmentIntervals(edit: EditSettings, range: TimeRange): TimeRange[] {
  return outputCues({ ...edit, subtitles: { mode: 'burn', cues: [{ ...range, text: '' }] } }).map(
    ({ start, end }) => ({ start, end }),
  );
}
export function timedFilter(
  filter: string,
  edit: EditSettings,
  range?: TimeRange,
  outputSpace = false,
): string {
  if (!range) return filter;
  const expression =
    (outputSpace ? [range] : adjustmentIntervals(edit, range))
      .map((r) => `gte(t,${r.start})*lt(t,${r.end})`)
      .join('+') || '0';
  return `${filter}${filter.includes('=') ? ':' : '='}enable='${expression}'`;
}
