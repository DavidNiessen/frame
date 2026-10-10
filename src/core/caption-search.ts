import { parseSubtitles, type Subtitles } from './subtitles';
export interface CaptionSearchOptions { caseSensitive: boolean; wholeWords: boolean }
function pattern(find: string, options: CaptionSearchOptions): RegExp | null {
  if (!find) return null;
  if (find.length > 2000 || find.includes('\0')) throw new Error('Search text must be at most 2,000 characters.');
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(options.wholeWords ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped, options.caseSensitive ? 'gu' : 'giu');
}
export function findCaptions(subtitles: Subtitles, find: string, options: CaptionSearchOptions) {
  const regex = pattern(find, options); let count = 0; const cueIndices: number[] = [];
  if (regex) subtitles.cues.forEach((cue, index) => { const matches = [...cue.text.matchAll(regex)].length; count += matches; if (matches) cueIndices.push(index); });
  return { count, cueIndices };
}
export function replaceCaptions(subtitles: Subtitles, find: string, replacement: string, options: CaptionSearchOptions): Subtitles {
  const regex = pattern(find, options);
  if (!regex) return subtitles;
  if (replacement.length > 2000 || replacement.includes('\0')) throw new Error('Replacement text must be at most 2,000 characters.');
  return parseSubtitles({ ...subtitles, cues: subtitles.cues.map(cue => ({ ...cue, text: cue.text.replace(regex, () => replacement) })) });
}
