import { effectiveSpeed } from './effect-instances';
import { clipPositions } from './clips';
import { keptRanges } from './timeline';
import type { EditSettings } from './types';
import {
  assColor,
  captionFont,
  defaultCaptionStyle,
  parseCaptionStyle,
  type CaptionStyle,
} from './caption-style';
/** Percentages of the output frame; the bottom anchor follows caption alignment. */
export interface CaptionPosition {
  x: number;
  y: number;
}
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
  position?: CaptionPosition;
  style?: CaptionStyle;
}
export interface Subtitles {
  mode: 'none' | 'embed' | 'burn';
  cues: SubtitleCue[];
}
const emptySubtitles = (): Subtitles => ({ mode: 'none', cues: [] });
export function parseSubtitles(value: unknown): Subtitles {
  if (value === undefined) return emptySubtitles();
  const s = value as Subtitles;
  if (
    !s ||
    !['none', 'embed', 'burn'].includes(s.mode) ||
    !Array.isArray(s.cues) ||
    s.cues.length > 1000
  )
    throw new Error('Invalid subtitles. Use at most 1,000 cues.');
  return {
    mode: s.mode,
    cues: s.cues.map((c) => {
      if (
        !c ||
        !Number.isFinite(c.start) ||
        !Number.isFinite(c.end) ||
        c.start < 0 ||
        c.end <= c.start ||
        c.end > 86400 ||
        typeof c.text !== 'string' ||
        c.text.length > 2000 ||
        c.text.includes('\0')
      )
        throw new Error('Invalid subtitle timing or text.');
      const p = c.position;
      if (
        p !== undefined &&
        (!p || ![p.x, p.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 100))
      )
        throw new Error('Invalid caption position.');
      const style = parseCaptionStyle(c.style);
      return {
        start: c.start,
        end: c.end,
        text: c.text,
        ...(p ? { position: { x: p.x, y: p.y } } : {}),
        ...(style ? { style } : {}),
      };
    }),
  };
}
function seconds(value: string): number {
  const parts = value.replace(',', '.').split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n)) || parts.length < 2 || parts.length > 3)
    throw new Error('Invalid subtitle timestamp.');
  return parts.reduce((time, part) => time * 60 + part, 0);
}
export function importSubtitles(text: string): Subtitles {
  if (text.length > 2_000_000) throw new Error('Subtitle files must be smaller than 2 MB.');
  const cues: SubtitleCue[] = [];
  for (const block of text
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const index = lines.findIndex((l) => l.includes('-->'));
    if (index < 0) continue;
    const match = lines[index].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);
    if (!match) throw new Error('Invalid subtitle timing line.');
    // Imported captions are plain text; discard VTT/HTML styling and decode common entities.
    const caption = lines
      .slice(index + 1)
      .join('\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
    cues.push({ start: seconds(match[1]), end: seconds(match[2]), text: caption });
  }
  if (!cues.length) throw new Error('No cues found. Choose an SRT or WebVTT file.');
  return parseSubtitles({ mode: 'burn', cues });
}
export function outputCues(edit: EditSettings): SubtitleCue[] {
  let elapsed = 0;
  const result: SubtitleCue[] = [];
  const positions = edit.clips
    ? clipPositions(edit).map(({ clip, speed }) => ({ ...clip, speed }))
    : keptRanges(edit).map((range) => ({ ...range, speed: effectiveSpeed(edit) }));
  for (const range of positions) {
    for (const cue of edit.subtitles.cues) {
      const start = Math.max(cue.start, range.start),
        end = Math.min(cue.end, range.end);
      if (end > start)
        result.push({
          ...cue,
          start: elapsed + (start - range.start) / range.speed,
          end: elapsed + (end - range.start) / range.speed,
        });
    }
    elapsed += (range.end - range.start) / range.speed;
  }
  return result.sort((a, b) => a.start - b.start);
}
function stamp(time: number): string {
  const ms = Math.round(time * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
export function serializeSrt(cues: SubtitleCue[]): string {
  return cues
    .map(
      (c, i) =>
        `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text.replace(/\r/g, '').replace(/\n\s*\n/g, '\n')}\n`,
    )
    .join('\n');
}
/** ASS preserves per-cue placement. SRT and selectable captions use the player's layout. */
export function serializeCaptionAss(
  cues: SubtitleCue[],
  { width, height }: { width: number; height: number },
): string {
  const assStamp = (time: number) => {
    const cs = Math.round(time * 100);
    return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
  };
  const styles = cues.map((cue, index) => {
    const style = cue.style ?? defaultCaptionStyle,
      size = (width * style.size) / 100;
    return `Style: Caption${index},${captionFont(style).family},${size},${assColor(style.color)},${assColor(style.outline ? style.outlineColor : style.background, style.outline ? 1 : style.backgroundOpacity)},${assColor(style.background, style.backgroundOpacity)},${style.bold ? -1 : 0},${style.italic ? -1 : 0},${style.outline ? 4 : 3},${style.outline ? size * 0.08 : 3},0,${style.align === 'left' ? 1 : style.align === 'right' ? 3 : 2},${width * 0.05},${width * 0.05},${height * 0.08},1`;
  });
  const events = cues.map((c, index) => {
    const position = c.position
      ? `{\\pos(${(width * c.position.x) / 100},${(height * c.position.y) / 100})}`
      : '';
    const text = c.text
      .replace(/\\/g, '\\\\')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\r/g, '')
      .replace(/\n/g, '\\N');
    return `Dialogue: 0,${assStamp(c.start)},${assStamp(c.end)},Caption${index},${position}${text}`;
  });
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${styles.join('\n')}\n[Events]\nFormat: Layer, Start, End, Style, Text\n${events.join('\n')}\n`;
}
export const subtitleCodec = (format: string) =>
  ({ mp4: 'mov_text', mov: 'mov_text', mkv: 'srt', webm: 'webvtt' })[format];
