import { keptRanges, editedDuration } from './timeline';
import type { EditSettings, MediaAsset, TimeRange } from './types';
export interface SilenceOptions { threshold: number; minimum: number; padding: number }
export const defaultSilence: SilenceOptions = { threshold: -35, minimum: .5, padding: .1 };
export function parseSilence(value: unknown): SilenceOptions {
  const s = value as SilenceOptions;
  if (!s || ![s.threshold, s.minimum, s.padding].every(Number.isFinite) || s.threshold < -80 || s.threshold > -10 || s.minimum < .1 || s.minimum > 30 || s.padding < 0 || s.padding > 2) throw new Error('Choose a threshold from −80 to −10 dB, minimum 0.1–30 seconds and padding 0–2 seconds.');
  return { threshold: s.threshold, minimum: s.minimum, padding: s.padding };
}
export function silenceArgs(asset: MediaAsset, input: string, value: SilenceOptions): string[] {
  const s = parseSilence(value); if (!asset.hasAudio) throw new Error('This source has no audio.');
  return ['-loglevel', 'info', '-i', input, '-map', '0:a:0', '-vn', '-af', `silencedetect=noise=${s.threshold}dB:d=${s.minimum}`, '-f', 'null', '-'];
}
export class SilenceCollector {
  ranges: TimeRange[] = []; private start: number | null = null;
  push(line: string) {
    const start = line.match(/silence_start:\s*([\d.e+-]+)/); if (start) this.start = Number(start[1]);
    const end = line.match(/silence_end:\s*([\d.e+-]+)/); if (end && this.start !== null) { this.add(this.start, Number(end[1])); this.start = null; }
  }
  private add(start: number, end: number) { if (Number.isFinite(start) && Number.isFinite(end) && end > start && this.ranges.length < 1001) this.ranges.push({ start, end }); }
  finish(duration: number): TimeRange[] { if (this.start !== null) this.add(this.start, duration); if (this.ranges.length > 1000) throw new Error('More than 1,000 silent sections detected. Increase the minimum duration.'); return this.ranges.map(r => ({ start: Math.max(0, r.start), end: Math.min(duration, r.end) })).filter(r => r.end > r.start); }
}
export function silenceCandidates(ranges: TimeRange[], edit: EditSettings, padding: number): TimeRange[] {
  return ranges.flatMap(s => keptRanges(edit).map(r => ({ start: Math.max(r.start, s.start + padding), end: Math.min(r.end, s.end - padding) }))).filter(r => r.end - r.start >= .05);
}
export function applySilenceCuts(edit: EditSettings, selected: TimeRange[]): EditSettings {
  const sorted = [...edit.cuts, ...selected].sort((a, b) => a.start - b.start), cuts: TimeRange[] = [];
  for (const r of sorted) { const last = cuts.at(-1); if (last && r.start <= last.end) last.end = Math.max(last.end, r.end); else cuts.push({ ...r }); }
  const next = { ...edit, cuts }; const duration = editedDuration(next);
  if (duration < .05) throw new Error('Keep at least 0.05 seconds. Deselect a silent section or increase padding.');
  if (cuts.length > 1000) throw new Error('The project supports up to 1,000 removed sections.');
  return { ...next, audioFadeIn: Math.min(edit.audioFadeIn, duration), audioFadeOut: Math.min(edit.audioFadeOut, duration), videoFadeIn: Math.min(edit.videoFadeIn, duration), videoFadeOut: Math.min(edit.videoFadeOut, duration) };
}
