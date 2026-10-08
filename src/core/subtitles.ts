import { keptRanges } from './timeline';
import type { EditSettings } from './types';
export interface SubtitleCue { start: number; end: number; text: string }
export interface Subtitles { mode: 'none' | 'embed' | 'burn'; cues: SubtitleCue[] }
export const emptySubtitles = (): Subtitles => ({ mode: 'none', cues: [] });
export function parseSubtitles(value: unknown): Subtitles {
  if (value === undefined) return emptySubtitles();
  const s = value as Subtitles;
  if (!s || !['none', 'embed', 'burn'].includes(s.mode) || !Array.isArray(s.cues) || s.cues.length > 1000) throw new Error('Invalid subtitles. Use at most 1,000 cues.');
  return { mode: s.mode, cues: s.cues.map(c => {
    if (!c || !Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start || c.end > 86400 || typeof c.text !== 'string' || c.text.length > 2000 || c.text.includes('\0')) throw new Error('Invalid subtitle timing or text.');
    return { start: c.start, end: c.end, text: c.text };
  }) };
}
function seconds(value: string): number {
  const parts = value.replace(',', '.').split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n)) || parts.length < 2 || parts.length > 3) throw new Error('Invalid subtitle timestamp.');
  return parts.reduce((time, part) => time * 60 + part, 0);
}
export function importSubtitles(text: string): Subtitles {
  if (text.length > 2_000_000) throw new Error('Subtitle files must be smaller than 2 MB.');
  const cues: SubtitleCue[] = [];
  for (const block of text.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n'); const index = lines.findIndex(l => l.includes('-->'));
    if (index < 0) continue;
    const match = lines[index].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) throw new Error('Invalid subtitle timing line.');
    // Imported captions are plain text; discard VTT/HTML styling and decode common entities.
    const caption = lines.slice(index + 1).join('\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    cues.push({ start: seconds(match[1]), end: seconds(match[2]), text: caption });
  }
  if (!cues.length) throw new Error('No cues found. Choose an SRT or WebVTT file.');
  return parseSubtitles({ mode: 'burn', cues });
}
export function outputCues(edit: EditSettings): SubtitleCue[] {
  let elapsed = 0; const result: SubtitleCue[] = [];
  for (const range of keptRanges(edit)) {
    for (const cue of edit.subtitles.cues) {
      const start = Math.max(cue.start, range.start), end = Math.min(cue.end, range.end);
      if (end > start) result.push({ text: cue.text, start: elapsed + (start - range.start) / edit.speed, end: elapsed + (end - range.start) / edit.speed });
    }
    elapsed += (range.end - range.start) / edit.speed;
  }
  return result.sort((a, b) => a.start - b.start);
}
function stamp(time: number): string {
  const ms = Math.round(time * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export function serializeSrt(cues: SubtitleCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text.replace(/\r/g, '').replace(/\n\s*\n/g, '\n')}\n`).join('\n');
}
export const subtitleCodec = (format: string) => ({ mp4: 'mov_text', mov: 'mov_text', mkv: 'srt', webm: 'webvtt' }[format]);
