import type { TimeRange } from './types';
const clocks = new WeakMap<HTMLMediaElement, TimeRange[]>();
export function configurePreviewClock(media: HTMLMediaElement, ranges?: TimeRange[]) {
  if (ranges) clocks.set(media, ranges); else clocks.delete(media);
  media.dataset.previewClock = ranges ? 'sequence' : 'source';
}
export function previewSourceTime(ranges: TimeRange[], time: number) {
  let elapsed = 0;
  for (const range of ranges) {
    const length = range.end - range.start;
    if (time < elapsed + length - 1e-8) return range.start + Math.max(0, time - elapsed);
    elapsed += length;
  }
  return ranges.at(-1)!.end;
}
export function previewMediaTime(ranges: TimeRange[], source: number) {
  let elapsed = 0;
  for (const range of ranges) {
    if (source < range.end) return elapsed + Math.max(0, source - range.start);
    elapsed += range.end - range.start;
  }
  return elapsed;
}
export function readPreviewTime(media: HTMLMediaElement) {
  const ranges = clocks.get(media);
  return ranges ? previewSourceTime(ranges, media.currentTime) : media.currentTime;
}
export function seekPreviewTime(media: HTMLMediaElement, source: number) {
  const ranges = clocks.get(media), target = ranges ? previewMediaTime(ranges, source) : source;
  if (Math.abs(media.currentTime - target) > 1e-8) media.currentTime = target;
}
export function hasPreviewClock(media: HTMLMediaElement) { return clocks.has(media); }
