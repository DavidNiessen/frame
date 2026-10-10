import type { TimeRange } from './types';
export interface PreviewRange extends TimeRange { speed?: number }
const clocks = new WeakMap<HTMLMediaElement, PreviewRange[]>();
export function configurePreviewClock(media: HTMLMediaElement, ranges?: PreviewRange[]) {
  if (ranges) clocks.set(media, ranges); else clocks.delete(media);
  media.dataset.previewClock = ranges ? 'sequence' : 'source';
}
export function previewSourceTime(ranges: PreviewRange[], time: number) {
  let elapsed = 0;
  for (const range of ranges) {
    const speed = range.speed ?? 1, length = (range.end - range.start) / speed;
    if (time < elapsed + length - 1e-8) return range.start + Math.max(0, time - elapsed) * speed;
    elapsed += length;
  }
  return ranges.at(-1)!.end;
}
export function previewMediaTime(ranges: PreviewRange[], source: number, preferredOutput?: number) {
  let offset = 0; const matches: number[] = [];
  for (const range of ranges) {
    if (source >= range.start && source <= range.end) matches.push(offset + (source - range.start) / (range.speed ?? 1));
    offset += (range.end - range.start) / (range.speed ?? 1);
  }
  if (matches.length) return preferredOutput === undefined ? matches[0] : matches.reduce((best, value) => Math.abs(value - preferredOutput) < Math.abs(best - preferredOutput) ? value : best);
  let elapsed = 0;
  for (const range of ranges) {
    if (source < range.end) return elapsed + Math.max(0, source - range.start) / (range.speed ?? 1);
    elapsed += (range.end - range.start) / (range.speed ?? 1);
  }
  return elapsed;
}
export function readPreviewTime(media: HTMLMediaElement) {
  const ranges = clocks.get(media);
  return ranges ? previewSourceTime(ranges, media.currentTime) : media.currentTime;
}
export function seekPreviewTime(media: HTMLMediaElement, source: number, output?: number) {
  const ranges = clocks.get(media), target = ranges ? previewMediaTime(ranges, source, output ?? media.currentTime) : source;
  if (output !== undefined) media.dataset.previewSeekOutput = String(output);
  if (Math.abs(media.currentTime - target) > 1e-8) media.currentTime = target;
}
export function hasPreviewClock(media: HTMLMediaElement) { return clocks.has(media); }
