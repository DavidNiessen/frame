import type { TimeRange } from './types';

export const minimumSection = 0.05;
/** Decimal and frame boundaries can differ by a few floating-point bits. */
export const timeEpsilon = 1e-8;
export function minimumSourceDuration(speed = 1) {
  return minimumSection * Math.max(1, speed);
}
export function hasMinimumDuration(range: TimeRange, speed = 1) {
  return (
    Number.isFinite(range.start) &&
    Number.isFinite(range.end) &&
    range.end - range.start + timeEpsilon >= minimumSourceDuration(speed)
  );
}
